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
        this.start = new Date().getTime();
        this.end = addMinutes(new Date(time), 120);
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
function Course(id, title, duration, time) {
    function Course(title, duration, time) {
        this.title = title;
        this.duration = duration;
        this.time = time;
    }
    return client.makeObservableObject(id, new Course(title, duration, time));
}
function getMeetings() {
    return meetings;
}
function getTasks() {
    return tasks;
}
function getCourses() {
    return courses;
}
function addTask(title, priority) {
    var task;
    task = new Task('task', title, priority);
    tasks.push(task);
}
function addMeeting(title, notes, time) {
    var meeting;
    meeting = new Meeting('meeting', title, notes, time);
    meetings.push(meeting);
}
function addCourse(title, duration, time) {
    var course;
    course = new Course('course', title, duration, time);
    courses.push(course);
}
function sortMeetings() {
    function anonf1(m1, m2) {
        var first;
        var second;
        first = m1.start;
        second = m2.start;
        return first - second;
    }
    var meetings;
    meetings = getMeetings();
    meetings.sort(anonf1);
}
function sortTasks() {
    function anonf2(t1, t2) {
        if (t1.status == t2.status) {
            return t1.priority - t2.priority;
        } else {
            return t1.status - t2.status;
        }
    }
    var tasks;
    tasks = getTasks();
    tasks.sort(anonf2);
}
function isValidTimeDescr(descr) {
    var sched;
    sched = later.parse.text(descr);
    return sched.error === -1;
}
function happenedInPast(date) {
    var now;
    now = new Date().getTime();
    return date < now;
}
function addMinutes(date, minutes) {
    var ms;
    ms = date.getTime();
    return new Date(ms + minutes * 60000);
}
function calculateNext(timeDescription) {
    var parsed;
    var s;
    var next;
    parsed = later.parse.text(timeDescription);
    s = later.schedule(parsed);
    next = s.next(1);
    return new Date(next);
}
function calculatePrevious(timeDescription) {
    var parsed;
    var s;
    var next;
    parsed = later.parse.text(timeDescription);
    s = later.schedule(parsed);
    next = s.prev(1);
    return new Date(next);
}
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
later.date.localTime();
var activityToday;
var latestUpdate;
function updateActivity() {
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
function processMeetingMonths() {
    var currYear;
    var months;
    var meetings;
    currYear = new Date().getFullYear();
    function anonf4(meeting) {
        var date;
        var month;
        var year;
        date = new Date(meeting.start);
        month = date.getMonth();
        year = date.getFullYear();
        if (year == currYear)
            months[month] = months[month] + 1;
    }
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
    meetings = getMeetings();
    meetings.forEach(anonf4);
    return months;
}
function processTasksStatus() {
    var todo;
    var finished;
    var inprogress;
    var tasks;
    todo = 0;
    finished = 0;
    function anonf5(task) {
        if (task.status < 0) {
            todo++;
        } else if (task.status > 0) {
            finished++;
        } else {
            inprogress++;
        }
    }
    inprogress = 0;
    tasks = getTasks();
    tasks.forEach(anonf5);
    return [
        todo,
        finished,
        inprogress
    ];
}
(function () {
    activityToday = 0;
    REDSTONE.updateVariable('activityToday', activityToday);
}());
latestUpdate = false;
var meetingTitle;
var meetingDate;
var meetingNotes;
var currentlyEditingM;
function addMeetingUI() {
    if (currentlyEditingM) {
        currentlyEditingM.title = meetingTitle;
        currentlyEditingM.start = meetingDate;
        currentlyEditingM.notes = meetingNotes;
        currentlyEditingM = false;
    } else {
        addMeeting(meetingTitle, meetingNotes, meetingDate);
    }
    sortMeetings();
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
function editMeetingUI(ev) {
    var idx;
    var meetings;
    var dateS;
    idx = ev.index;
    meetings = getMeetings();
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
    sortMeetings();
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
var taskTitle;
var taskPriority;
function addTaskUI() {
    addTask(taskTitle, taskPriority);
    sortTasks();
    (function () {
        taskTitle = '';
        REDSTONE.updateVariable('taskTitle', taskTitle);
    }());
    (function () {
        taskPriority = '';
        REDSTONE.updateVariable('taskPriority', taskPriority);
    }());
}
function nextStatusTask(ev) {
    var idx;
    var tasks;
    var task;
    var now;
    idx = ev.index;
    tasks = getTasks();
    task = tasks[idx];
    now = new Date();
    if (task.status < 1) {
        task.status = task.status + 1;
        task.lastUpdate = now.getTime();
    }
    updateActivity();
    sortTasks();
}
(function () {
    taskTitle = '';
    REDSTONE.updateVariable('taskTitle', taskTitle);
}());
(function () {
    taskPriority = '';
    REDSTONE.updateVariable('taskPriority', taskPriority);
}());
function createTaskChart() {
    var stats;
    var todo;
    var finished;
    var inprogress;
    var chart;
    stats = processTasksStatus();
    todo = {
        name: 'to start',
        y: stats[0]
    };
    finished = {
        name: 'finished',
        y: stats[1]
    };
    inprogress = {
        name: 'in progress',
        y: stats[2]
    };
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
    var options;
    var months;
    var chart;
    options = Highcharts.getOptions();
    months = processMeetingMonths();
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
    var meetings;
    var courses;
    var calendar;
    schedule = [];
    meetings = getMeetings();
    courses = getCourses();
    meetings.forEach(anonf6);
    function anonf6(appointment) {
        appointment.class = 'event-info';
        schedule.push(appointment);
    }
    function anonf7(course) {
        var nextDate;
        var prevDate;
        var endNextDate;
        var endPrevDate;
        var next;
        var prev;
        nextDate = calculateNext(course.time);
        prevDate = calculatePrevious(course.time);
        endNextDate = addMinutes(nextDate, course.duration);
        endPrevDate = addMinutes(prevDate, course.duration);
        next = {
            title: course.title,
            start: nextDate.getTime(),
            end: endNextDate.getTime(),
            class: 'event-info'
        };
        prev = {
            title: course.title,
            start: prevDate.getTime(),
            end: endPrevDate.getTime(),
            class: 'event-info'
        };
        schedule.push(next);
        schedule.push(prev);
    }
    courses.forEach(anonf7);
    calendar = $('#calendar').calendar({
        tmpl_path: 'tmpls/',
        view: 'week',
        events_source: schedule
    });
    calendar.view();
}
client.expose({});