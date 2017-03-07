# Transpozor Plugin Interface

The transpozor manager doesn't care what technology plugins use internally – as long as they all implement the same standard interface:



## `Plugin.id` (String)

The `id` is the name that the `transpozor.rescan()` method uses to identify which plugin to invoke for each new/empty widget marker found.

A plugin's `id` should be both fairly unique and descriptive.



## `Plugin.selector` (String)

The CSS selector used by transpozor manager to search for existing HTML snippets for this plugin to consume.



## `Plugin.parseData(elm, editElm, isInserting)` (Function, optional)

`elm` is the HTML element being consumed by the plugin, and the `.parseData()` method allows the plugin to extract some initial state data from that HTML before it is thrown out and replaced by a sandboxed container element for the plugin's custom editing interface.

`editElm` is the Eplica inline-editing ancestor element of `elm`.

The `isInsering` parameter is a boolean flag that defaults to `false`, but is set to `true` to signal when the `elm` is an insert-new-widget marker.

The return value of `.parseData()` is later passed to the plugin's widget constructor/factory function.

NOTE: This method SHOULD NOT attempt to modify `elm` or its surroundings

If a plugin doesn't expose a `.parseData()` method, the transpozor will use this simple default method instead:

```js
var defaultParseData = function (elm) {
  return JSON.parse( elm.getAttribute('data-transpozor') ) || {};
};
```



## `Plugin.validateInsertion(placeholderElm, editElm)` (Function, optional)

This optional method is only called when a new/empty widget is being inserted.
It allows the plugin to validate (and optionally fix) the DOM position of the insertion marker element.

The method may `return false` to cancel the insertion altogether.



## `Plugin({ data, rootElm, editElm })` (Function)

The Plugin itself must be function that A) returns a new widget instance object and B) immediately starts up the editing interface.

(Note that the plugin function is called with a `new` keyword so it may also be an ES6 `Class` or an old-school object constructor.)

The factory function/contstructor is invoked right *after* the transpozor's `start` event, and receives a single `props` object containing three properties:

`props.data` is whatever was returned by the plugin's `.parseData()` method (or the transpozors manager's `defaultParseData()` function).

`props.rootElm` is the sandboxed container element the transpozor manager provides for this widget instance to host its editing interface and eventual `.toHTML()` export.

`props.editElm` is the widget instance's related inline-editing element



## `widgetInstance.toHTML()` (Function)

The widget instance that the plugin returns must expose a single method `.toHTML()`.

`.toHTML()` gets called with no parameters, just *before* the transpozor's `end` event. It should destroy the editing interface, and render static HTML into its `rootElm`.

if a `Promise` is returned the transpozor will wait for it to resolve before allowing the Inline Editor to continue saving.  (NOTE: Rejecting the promise will have unpredictable, catastrophic results.)



## `widgetInstance.onRemove()` (Function, optional)

This method is called when a user clicks the widget's "Remove" button, to allow cleanup, unmounting, etc.

If the `.onRemove()` method returns a `boolean` value, that value is interpreted as a confirmation.  `true` removes the widget without further ado, while `false` cancels the removal.

If `.onRemove()` is missing, or doesn't return a `boolean`, then a default `confirm()` prompt is displayed.
