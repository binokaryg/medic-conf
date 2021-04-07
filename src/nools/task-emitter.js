var prepareDefinition = require('./definition-preparation');

function taskEmitter(taskDefinitions, c, Utils, Task, emit) {
  if (!taskDefinitions) return;

  var taskDefinition, r;
  for (var idx1 = 0; idx1 < taskDefinitions.length; ++idx1) {
    taskDefinition = taskDefinitions[idx1];
    prepareDefinition(taskDefinition, defaultResolvedIf, Utils);

    switch (taskDefinition.appliesTo) {
      case 'reports':
      case 'scheduled_tasks':
        for (var idx2=0; idx2<c.reports.length; ++idx2) {
          r = c.reports[idx2];
          emitTasks(taskDefinition, Utils, Task, emit, c, r);
        }
        break;
      case 'contacts':
        if (c.contact) {
          emitTasks(taskDefinition, Utils, Task, emit, c);
        }
        break;
      default:
        throw new Error('Unrecognised task.appliesTo: ' + taskDefinition.appliesTo);
    }
  }
}

function emitTasks(taskDefinition, Utils, Task, emit, c, r) {
  var i;

  if (taskDefinition.appliesToType) {
    var type;
    if (taskDefinition.appliesTo === 'contacts') {
      if (!c.contact) {
        // no assigned contact - does not apply
        return;
      }
      type = c.contact.type === 'contact' ? c.contact.contact_type : c.contact.type;
    } else {
      if (!r) {
        // no report - does not apply
        return;
      }
      type = r.form;
    }
    if (taskDefinition.appliesToType.indexOf(type) === -1) {
      // does not apply to this type
      return;
    }
  }

  if (taskDefinition.appliesTo !== 'scheduled_tasks' && taskDefinition.appliesIf && !taskDefinition.appliesIf(c, r)) {
    return;
  }

  if (taskDefinition.appliesTo === 'scheduled_tasks'){
    if (r && taskDefinition.appliesIf) {
      if (!r.scheduled_tasks) {
        return;
      }

      for (i = 0; i < r.scheduled_tasks.length; i++) {
        if (taskDefinition.appliesIf(c, r, i)) {
          emitForEvents(i);
        }
      }
    }
  } else {
    emitForEvents();
  }

  function obtainContactLabelFromSchedule(taskDefinition, c, r) {
    var contactLabel;
    if (typeof taskDefinition.contactLabel === 'function') {
      contactLabel = taskDefinition.contactLabel(c, r);
    } else {
      contactLabel = taskDefinition.contactLabel;
    }
  
    return contactLabel ? { name: contactLabel } : c.contact;
  }  

  function emitForEvents(scheduledTaskIdx) {
    var i, dueDate = null, event, priority, task;
    for (i = 0; i < taskDefinition.events.length; i++) {
      event = taskDefinition.events[i];

      if (event.dueDate) {
        dueDate = event.dueDate(event, c, r, scheduledTaskIdx);
      } else if (r) {
        if (scheduledTaskIdx !== undefined) {
          dueDate = new Date(Utils.addDate(new Date(r.scheduled_tasks[scheduledTaskIdx].due), event.days));
        } else {
          dueDate = new Date(Utils.addDate(new Date(r.reported_date), event.days));
        }
      } else {
        if (event.dueDate) {
          dueDate = event.dueDate(event, c);
        } else {
          var defaultDueDate = c.contact && c.contact.reported_date ? new Date(c.contact.reported_date) : new Date();
          dueDate = new Date(Utils.addDate(defaultDueDate, event.days));
        }
      }

      if (!Utils.isTimely(dueDate, event)) {
        continue;
      }

      task = {
        // One task instance for each event per form that triggers a task, not per contact
        // Otherwise they collide when contact has multiple reports of the same form
        _id: (r ? r._id : c.contact && c.contact._id) + '~' + (event.id || i) + '~' + taskDefinition.name,
        deleted: !!((c.contact && c.contact.deleted) || r ? r.deleted : false),
        doc: c,
        contact: obtainContactLabelFromSchedule(taskDefinition, c, r),
        icon: taskDefinition.icon,
        date: dueDate,
        readyStart: event.start || 0,
        readyEnd: event.end || 0,
        title: taskDefinition.title,
        actions: taskDefinition.actions.map(initActions),
      };

      if (typeof taskDefinition.resolvedIf === 'function') {
        task.resolved = taskDefinition.resolvedIf(c, r, event, dueDate, scheduledTaskIdx);
      }
      else {
        var resolvingForm = taskDefinition.actions.find(function (action) { return action.type === 'report'; }).form;
        task.resolved = defaultResolvedIf(c, r, event, dueDate, resolvingForm, Utils);
      }

      if (scheduledTaskIdx !== undefined) {
        task._id += '-' + scheduledTaskIdx;
      }

      priority = taskDefinition.priority;
      if (typeof priority === 'function') {
        priority = priority(c, r);
      }

      if (priority) {
        task.priority = priority.level;
        task.priorityLabel = priority.label;
      }

      emit('task', new Task(task));
    }
  }

  function initActions(def) {
    var appliesToReport = !!r;
    var content = {
      source: 'task',
      source_id: appliesToReport ? r._id : c.contact && c.contact._id,
      contact: c.contact,
    };

    if (def.modifyContent) {
      def.modifyContent(content, c, r);
    }

    return {
      type: def.type || 'report',
      form: def.form,
      label: def.label || 'Follow up',
      content: content,
    };
  }
}

function defaultResolvedIf (c, r, event, dueDate, resolvingForm, Utils) {
  var start = 0;
  if (r) {//Report based task
    //Start of the task window or after the report's reported date, whichever comes later
    start = Math.max(Utils.addDate(dueDate, -event.start).getTime(), r.reported_date + 1);
  }
  else {
    start = Utils.addDate(dueDate, -event.start).getTime();
  }
  var end = Utils.addDate(dueDate, event.end + 1).getTime();
  return Utils.isFormSubmittedInWindow(
    c.reports,
    resolvingForm,
    start,
    end
  );
}

module.exports = taskEmitter;
