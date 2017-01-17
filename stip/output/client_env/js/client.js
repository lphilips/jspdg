var client = new ClientData('http://localhost:3000', {}, function (name, object) {
    if (typeof ractive !== 'undefined')
        ractive.update();
}, function (id, prop, value) {
    if (typeof ractive !== 'undefined')
        ractive.update();
});
client.onConnected(function () {
    REDSTONE.onConnected();
});
client.onDisconnected(function () {
    REDSTONE.onDisconnected();
});
var meetings;
var tasks;
var courses;
(function () {
    meetings = client.makeReplicatedObject('meetings', []);
    REDSTONE.updateVariable('meetings', meetings);
}());
(function () {
    tasks = client.makeReplicatedObject('tasks', []);
    REDSTONE.updateVariable('tasks', tasks);
}());
courses = client.makeReplicatedObject('courses', []);
function Meeting(id, title, notes, time) {
    function Meeting(title, notes, time) {
        this.title = title;
        this.notes = notes;
        this.start = new Date(time).getTime();
        this.end = new Date(this.start + 2 * 60 * 60 * 1000);
    }
    return client.makeReplicatedObject(id, new Meeting(title, notes, time));
}
function Task(id, title, priority) {
    function Task(title, priority) {
        this.title = title;
        this.status = -1;
        this.priority = priority;
    }
    return client.makeReplicatedObject(id, new Task(title, priority));
}
function Course(id, title, start, end) {
    function Course(title, start, end) {
        this.title = title;
        this.start = new Date(start).getTime();
        this.end = new Date(end).getTime();
    }
    return client.makeReplicatedObject(id, new Course(title, start, end));
}
var meetingTitle;
var meetingDate;
var meetingNotes;
var currentlyEditingM;
var taskTitle;
var taskPriority;
var activityToday;
var latestUpdate;
function updateActivity() {
    function happenedToday(date1, date2) {
        var year1;
        var year2;
        var month2;
        var month1;
        var day1;
        var day2;
        year1 = date1.getFullYear();
        year2 = date2.getFullYear();
        month2 = date2.getMonth();
        month1 = date1.getMonth();
        day1 = date1.getDay();
        day2 = date2.getDay();
        return year1 == year2 && month1 == month2 && day1 == day2;
    }
    var now;
    now = new Date();
    if (latestUpdate) {
        if (happenedToday(latestUpdate, now)) {
            (function () {
                activityToday = activityToday + 1;
                REDSTONE.updateVariable('activityToday', activityToday);
            }());
            latestUpdate = now;
        } else {
            (function () {
                activityToday = 1;
                REDSTONE.updateVariable('activityToday', activityToday);
            }());
            latestUpdate = now;
        }
    } else {
        latestUpdate = now;
        (function () {
            activityToday = activityToday + 1;
            REDSTONE.updateVariable('activityToday', activityToday);
        }());
    }
}
function addMeeting() {
    function anonf2(m1, m2) {
        var first;
        var second;
        first = m1.start;
        second = m2.start;
        return first - second;
    }
    if (currentlyEditingM) {
        currentlyEditingM.title = meetingTitle;
        currentlyEditingM.start = meetingDate;
        currentlyEditingM.notes = meetingNotes;
        currentlyEditingM = false;
    } else {
        meetings.push(new Meeting(false, meetingTitle, meetingNotes, meetingDate));
    }
    meetings.sort(anonf2);
    (function () {
        meetingTitle = '';
        REDSTONE.updateVariable('meetingTitle', meetingTitle);
    }());
    (function () {
        meetingDate = '';
        REDSTONE.updateVariable('meetingDate', meetingDate);
    }());
    (function () {
        meetingNotes = '';
        REDSTONE.updateVariable('meetingNotes', meetingNotes);
    }());
}
function addTask() {
    function anonf3(t1, t2) {
        if (t1.status == t2.status) {
            return t1.priority - t2.priority;
        } else {
            return t1.status - t2.status;
        }
    }
    tasks.push(new Task(false, taskTitle, taskPriority));
    tasks.sort(anonf3);
    (function () {
        taskTitle = '';
        REDSTONE.updateVariable('taskTitle', taskTitle);
    }());
    (function () {
        taskPriority = '';
        REDSTONE.updateVariable('taskPriority', taskPriority);
    }());
}
function happenedInPast(date1) {
    var now;
    now = new Date().getTime();
    return date1 < now;
}
function editMeeting(ev) {
    var idx;
    var dateS;
    idx = ev.index;
    currentlyEditingM = meetings[idx];
    dateS = currentlyEditingM.start;
    (function () {
        meetingTitle = currentlyEditingM.title;
        REDSTONE.updateVariable('meetingTitle', meetingTitle);
    }());
    (function () {
        meetingNotes = currentlyEditingM.notes;
        REDSTONE.updateVariable('meetingNotes', meetingNotes);
    }());
    (function () {
        meetingDate = new Date(dateS);
        REDSTONE.updateVariable('meetingDate', meetingDate);
    }());
}
function nextStatusTask(ev) {
    var idx;
    var task;
    var now;
    idx = ev.index;
    task = tasks[idx];
    now = new Date();
    if (task.status < 1) {
        task.status = task.status + 1;
        task.lastUpdate = now.getTime();
    }
    updateActivity();
}
function createTaskChart() {
    var finished;
    var todo;
    var inprogress;
    var chart;
    finished = {
        name: 'finished',
        y: 0
    };
    todo = {
        name: 'to start',
        y: 0
    };
    inprogress = {
        name: 'in progress',
        y: 0
    };
    function anonf4(task) {
        if (task.status < 0) {
            todo.y = todo.y + 1;
        } else if (task.status > 0) {
            finished.y = finished.y + 1;
        } else {
            inprogress.y = inprogress.y + 1;
        }
    }
    tasks.forEach(anonf4);
    chart = {
        chart: {
            type: 'pie',
            options3d: {
                enabled: true,
                alpha: 45
            }
        },
        title: { text: 'Tasks' },
        plotOptions: {
            pie: {
                innerSize: 100,
                depth: 45
            }
        },
        colors: [
            '#249AA7',
            '#ABD25E',
            '#F1594A',
            '#F8C830'
        ],
        series: [{
                name: 'Tasks',
                data: [
                    finished,
                    todo,
                    inprogress
                ]
            }]
    };
    $('#chartscontainer').highcharts(chart);
}
function createMeetingChart() {
    var currYear;
    var options;
    var months;
    var chart;
    currYear = new Date().getFullYear();
    options = Highcharts.getOptions();
    months = [
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0
    ];
    function anonf5(meeting) {
        var date;
        var month;
        var year;
        date = new Date(meeting.start);
        month = date.getMonth();
        year = date.getFullYear();
        if (year == currYear)
            months[month] = months[month] + 1;
    }
    meetings.forEach(anonf5);
    chart = {
        chart: {
            type: 'column',
            options3d: {
                enabled: true,
                alpha: 10,
                beta: 25,
                depth: 70
            }
        },
        title: { text: 'Meetings this year' },
        colors: [
            '#249AA7',
            '#ABD25E',
            '#F1594A',
            '#F8C830'
        ],
        plotOptions: { column: { depth: 25 } },
        xAxis: { categories: options.lang.shortMonths },
        yAxis: { title: { text: null } },
        series: [{
                name: 'Meetings',
                data: months
            }]
    };
    $('#chartmeetingcontainer').highcharts(chart);
}
function createCharts() {
    createTaskChart();
    createMeetingChart();
}
function displaySchedule() {
    var schedule;
    var calendar;
    schedule = meetings.concat(courses);
    function anonf6(appointment) {
        appointment.class = 'event-info';
    }
    schedule.forEach(anonf6);
    calendar = $('#calendar').calendar({
        tmpl_path: 'tmpls/',
        view: 'week',
        events_source: schedule
    });
    calendar.view();
}
(function () {
    meetingTitle = '';
    REDSTONE.updateVariable('meetingTitle', meetingTitle);
}());
(function () {
    meetingDate = '';
    REDSTONE.updateVariable('meetingDate', meetingDate);
}());
(function () {
    meetingNotes = '';
    REDSTONE.updateVariable('meetingNotes', meetingNotes);
}());
currentlyEditingM = '';
(function () {
    taskTitle = '';
    REDSTONE.updateVariable('taskTitle', taskTitle);
}());
(function () {
    taskPriority = '';
    REDSTONE.updateVariable('taskPriority', taskPriority);
}());
(function () {
    activityToday = 0;
    REDSTONE.updateVariable('activityToday', activityToday);
}());
latestUpdate = false;