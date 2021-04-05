/*
Declarative tasks and targets (the elements exported by partner task.js and target.js files), are complex objects containing functions. 
Definition-preparation.js binds a value for `this` in all the functions within a definition. 
This fascilitates simple data sharing between functions, and allows function logic to reference the definition itself.
*/

function prepare(definition, Utils) {
  var targetContext = {};
  bindAllFunctionsToContext(definition, targetContext);
  targetContext.definition = deepCopy(definition);
  targetContext.defaultResolvedIf = function (contact, report, event, dueDate, resolvingForm) {
    var start = 0;
    if (report) {//Report based task
      //Start of the task window or after the report's reported date, whichever comes later
      start = Math.max(Utils.addDate(dueDate, -event.start).getTime(), report.reported_date + 1);
    }
    else {
      start = Utils.addDate(dueDate, -event.start).getTime();
    }
    var end = Utils.addDate(dueDate, event.end + 1).getTime();
    return Utils.isFormSubmittedInWindow(
      contact.reports,
      resolvingForm || this.definition.actions[0].form,
      start,
      end
    );
  };
}

function bindAllFunctionsToContext(obj, context) {
  var keys = Object.keys(obj);
  for (var i in keys) {
    var key = keys[i];
    switch(typeof obj[key]) {
      case 'object':
        bindAllFunctionsToContext(obj[key], context);
        break;
      case 'function':
        obj[key] = obj[key].bind(context);
        break;
    }
  }
}

function deepCopy(obj) {
  var copy = Object.assign({}, obj);
  var keys = Object.keys(copy);
  for (var i in keys) {
    var key = keys[i];
    if (Array.isArray(copy[key])) {
      copy[key] = copy[key].slice(0);
      for (var j = 0; j < copy[key].length; ++j) {
        if (typeof copy[key][j] === 'object') {
          copy[key][j] = deepCopy(copy[key][j]);
        }
      }
    } else if (typeof copy[key] === 'object') {
      copy[key] = deepCopy(copy[key]);
    }
  }
  return copy;
}

module.exports = prepare;
