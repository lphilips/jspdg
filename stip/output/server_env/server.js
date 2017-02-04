var express = require('express'), app = express();
var ServerData = require('./rpc/data-server.js');
var server = new ServerData(app, 3000);
app.use('/client', express.static(__dirname + '/../client_env/js'));
app.use('/', express.static(__dirname + '/../client_env'));
var fs = require('fs');
var later = require('later');
var meetings;
var tasks;
var courses;
function Meeting(id, title, notes, time) {
    function Meeting(title, notes, time) {
        this.title = title;
        this.notes = notes;
        this.start = new Date(time).getTime();
        this.end = new Date(this.start + 2 * 60 * 60 * 1000);
    }
    return server.makeReplicatedObject(id, new Meeting(title, notes, time));
}
function Task(id, title, priority) {
    function Task(title, priority) {
        this.title = title;
        this.status = -1;
        this.priority = priority;
    }
    return server.makeReplicatedObject(id, new Task(title, priority));
}
function Course(id, title, duration, time) {
    function Course(title, duration, time) {
        this.title = title;
        this.duration = duration;
        this.time = time;
    }
    return server.makeReplicatedObject(id, new Course(title, duration, time));
}
meetings = server.makeReplicatedObject('meetings', []);
tasks = server.makeReplicatedObject('tasks', []);
courses = server.makeReplicatedObject('courses', []);
var dataCourses;
var coursesJSON;
tasks.push(new Task(false, 'Learn uni-corn!'));
function anonf1(json) {
    var course;
    course = new Course('course', json.title, json.duration, json.time);
    courses.push(course);
}
fs.readFile('data.json', function (err1, res1) {
    dataCourses = res1;
    coursesJSON = JSON.parse(dataCourses);
    coursesJSON.forEach(anonf1);
});
var activityToday;
var latestUpdate;
function processMeetingMonths() {
    var currYear;
    var months;
    function anonf2(meeting) {
        var date;
        var month;
        var year;
        date = new Date(meeting.start);
        month = date.getMonth();
        year = date.getFullYear();
        if (year == currYear)
            months[month] = months[month] + 1;
    }
    currYear = new Date().getFullYear();
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
    meetings.forEach(anonf2);
    return months;
}
function processTasksStatus() {
    var todo;
    var finished;
    var inprogress;
    todo = 0;
    function anonf3(task) {
        if (task.status < 0) {
            todo++;
        } else if (task.status > 0) {
            finished++;
        } else {
            inprogress++;
        }
    }
    finished = 0;
    inprogress = 0;
    tasks.forEach(anonf3);
    return [
        todo,
        finished,
        inprogress
    ];
}
activityToday = 0;
latestUpdate = false;
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
