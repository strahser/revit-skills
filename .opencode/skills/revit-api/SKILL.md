---
name: revit-api
description: >
  Build Revit model automation with the Revit API using Nice3point.Revit.Extensions and Nice3point.Revit.Toolkit.
  USE FOR: creating elements, modifying parameters, querying the model, handling transactions, and automating Revit workflows.
  DO NOT USE FOR: writing tests (use revit-testing), creating UI interfaces (use revit-ui).
license: MIT
---

# Revit API Development

Build Revit add-ins and automate the Revit model using the Revit API with fluent extensions from `Nice3point.Revit.Extensions` and toolkit utilities from `Nice3point.Revit.Toolkit`.

## When to use

- Creating Revit elements (walls, floors, families, etc.)
- Reading or writing element parameters
- Querying the model with FilteredElementCollector
- Handling transactions and failure processing
- Automating repetitive Revit workflows

## When not to use

- Writing tests for Revit API code — use `revit-testing`
- Creating user interfaces — use `revit-ui`
- Setting up a new project — use `revit-solution`

## Core Concepts

### Transaction Pattern

All Revit model modifications must happen inside a transaction:

```csharp
using var transaction = new Transaction(document, "My Operation");
transaction.Start();

// ... modify model ...

transaction.Commit();
```

### Revit Thread Requirement

All Revit API calls must run on Revit's single thread. Use `ExternalEvent` for WPF/UI code:

```csharp
private readonly ExternalEvent _externalEvent = ExternalEvent.Create(MyHandler.Instance);

void OnButtonClick()
{
    _externalEvent.Raise();
}

class MyHandler : IExternalEventHandler
{
    public static readonly MyHandler Instance = new();
    
    public void Execute(UIApplication app)
    {
        // Revit API calls here
    }
    
    public string GetName() => nameof(MyHandler);
}
```

## Workflow

### Step 1: Create Elements

Use factory methods and extensions:

```csharp
// Create a wall
var wall = Wall.Create(document, curve, levelId, structural);

// Create a floor
var floor = document.Create.NewFloor(profile, floorType, level, structural);

// Create a family instance
var instance = document.Create.NewFamilyInstance(point, symbol, level, structuralType);
```

### Step 2: Query Elements

Use `Nice3point.Revit.Extensions` fluent collector:

```csharp
// Get all walls
var walls = document.CollectElements()
    .OfClass<Wall>()
    .ToElements();

// Filter by parameter
var tallWalls = document.CollectElements()
    .OfClass<Wall>()
    .WhereParameter(BuiltInParameter.WALL_USER_HEIGHT_PARAM)
    .IsGreaterThan(3.0, 1e-6)
    .ToElements();

// Get first match
var firstWall = document.CollectElements()
    .OfClass<Wall>()
    .FirstOrDefault();
```

### Step 3: Read/Write Parameters

Use fluent parameter accessors:

```csharp
// Find parameter
var param = wall.FindParameter(BuiltInParameter.WALL_USER_HEIGHT_PARAM);

// Read value
double heightFeet = param.AsDouble();
double heightMm = param.AsDouble().ToMillimeters();

// Write value (inside transaction)
param.Set(3.0.FromMeters());

// Type parameter
var typeParam = wall.WallType.FindParameter("MyParameter");
```

### Step 4: Handle Failures

Use `RevitApiContext` for predictable failures:

```csharp
using (RevitApiContext.BeginFailureSuppressionScope())
{
    using var transaction = new Transaction(document, "Operation");
    transaction.Start();
    // ... operation that may raise expected failures
    transaction.Commit();
}
```

### Step 5: Unit Conversion

Revit stores lengths in feet; convert at boundaries:

```csharp
// Internal to display
double mm = parameter.AsDouble().ToMillimeters();
double meters = parameter.AsDouble().ToMeters();

// External to internal
double internalValue = 3.0.FromMeters();
double internalFeet = 10.0.FromFeet();
```

## Common Patterns

### Batch Operations

```csharp
using var transaction = new Transaction(document, "Batch Update");
transaction.Start();

foreach (var wall in walls)
{
    var param = wall.FindParameter(BuiltInParameter.WALL_USER_HEIGHT_PARAM);
    if (param != null && !param.IsReadOnly)
    {
        param.Set(newHeight.FromMeters());
    }
}

transaction.Commit();
```

### Element Creation with Parameters

```csharp
using var transaction = new Transaction(document, "Create Wall");
transaction.Start();

var wall = Wall.Create(document, curve, levelId, false);
wall.FindParameter("Comments").Set("Auto-created wall");

transaction.Commit();
```

### Document Operations

```csharp
// Save document
document.Save();

// Save as
document.SaveAs(newPath, new SaveAsOptions { OverwriteExistingFile = true });

// Close document
document.Close(false);
```

## Validation

- [ ] All model modifications happen inside a transaction.
- [ ] Revit API calls from UI code use ExternalEvent.
- [ ] Parameters are found with `FindParameter`, not raw `get_Parameter`.
- [ ] Length values are converted at boundaries with `ToMillimeters`/`FromMeters`.
- [ ] Failure suppression is scoped to the specific operation.

## Common Pitfalls

| Pitfall | Correct approach |
|---------|------------------|
| Modifying model without transaction | Wrap in `Transaction.Start()`/`Commit()`. |
| Calling Revit API from UI thread | Use `ExternalEvent` to dispatch to Revit thread. |
| Using raw `get_Parameter` | Use `FindParameter` which handles instance/type fallback. |
| Confusing feet and meters | Convert at boundaries with extension methods. |
| Suppressing all failures | Scope suppression to known, expected failures only. |
| Not disposing transactions | Use `using` statement for automatic disposal. |

## Async Patterns in Revit

Revit API is single-threaded. For long-running operations, use `Task.Run` with proper marshaling:

```csharp
// Run operation on background thread, marshal result back to Revit thread
var result = await Task.Run(() =>
{
    // Heavy computation here (no Revit API calls)
    return computedValue;
});

// Use result on Revit thread
using var transaction = new Transaction(document, "Apply Result");
transaction.Start();
element.LookupParameter("Result").Set(result);
transaction.Commit();
```

### ExternalEvent for Async Operations

```csharp
public class AsyncOperationHandler : IExternalEventHandler
{
    private TaskCompletionSource<bool> _tcs;
    
    public void Execute(UIApplication app)
    {
        try
        {
            // Long Revit operation
            HeavyRevitOperation(app);
            _tcs?.SetResult(true);
        }
        catch (Exception ex)
        {
            _tcs?.SetException(ex);
        }
    }
    
    public Task RunAsync(ExternalEvent externalEvent)
    {
        _tcs = new TaskCompletionSource<bool>();
        externalEvent.Raise();
        return _tcs.Task;
    }
    
    public string GetName() => nameof(AsyncOperationHandler);
}
```

## Non-Modal Windows

Non-modal windows (ModelessDialog) require `IExternalEventHandler`:

```csharp
// Handler for non-modal window
public class NonModalHandler : IExternalEventHandler
{
    public static readonly NonModalHandler Instance = new();
    public ExternalEvent Event { get; } = ExternalEvent.Create(Instance);
    
    public void Execute(UIApplication app)
    {
        var doc = app.ActiveUIDocument?.Document;
        if (doc is null) return;
        
        // Process UI request on Revit thread
        ProcessRequest(doc);
    }
    
    public string GetName() => nameof(NonModalHandler);
}

// Non-modal window
public partial class MyNonModalWindow : ModelessDialog
{
    public MyNonModalWindow()
    {
        InitializeComponent();
    }
    
    private void OnRefreshClick(object sender, EventArgs e)
    {
        // Request data update on Revit thread
        NonModalHandler.Instance.Event.Raise();
    }
}
```

## Geometry Operations

Common geometry patterns for Revit API:

```csharp
// Create a curve loop
var curveLoop = CurveLoop.Create(new List<Curve>
{
    Line.CreateBound(new XYZ(0, 0, 0), new XYZ(10, 0, 0)),
    Line.CreateBound(new XYZ(10, 0, 0), new XYZ(10, 10, 0)),
    Line.CreateBound(new XYZ(10, 10, 0), new XYZ(0, 10, 0)),
    Line.CreateBound(new XYZ(0, 10, 0), new XYZ(0, 0, 0))
});

// Check if point is inside curve loop
bool isInside = curveLoop.Contains(testPoint, plane, tolerance);

// Transform geometry
var transform = Transform.Translation(new XYZ(0, 0, 10));
var transformedCurve = curve.CreateTransformed(transform);

// BoundingBox operations
var bb = element.get_BoundingBox(null);
double volume = (bb.Max.X - bb.Min.X) * (bb.Max.Y - bb.Min.Y) * (bb.Max.Z - bb.Min.Z);
```

### Intersection Checking

```csharp
// Check for intersection between two elements
var result = new IntersectionResultArray();
var comparisonResult = element1.IntersectElement(element2, out result);
if (comparisonResult == SetComparisonResult.Overlap)
{
    // Elements intersect
    var intersectionPoint = result.First().XYZPoint;
}
```

## References

- [Revit API Documentation](https://www.revitapidocs.com/)
- [Nice3point.Revit.Extensions NuGet](https://www.nuget.org/packages/Nice3point.Revit.Extensions)
- [Nice3point.Revit.Toolkit NuGet](https://www.nuget.org/packages/Nice3point.Revit.Toolkit)
- [revit-skills Repository](https://github.com/Nice3point/revit-skills)
