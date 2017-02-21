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
    if (!isValidTimeDescr(json.time))
        throw new Error('Wrong time description in course');
    course = new Course('course', json.title, json.duration, json.time);
    courses.push(course);
}
fs.readFile('data.json', function (err1, res1) {
    dataCourses = res1;
    coursesJSON = JSON.parse(dataCourses);
    coursesJSON.forEach(anonf1);
});
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
    return ms + minutes * 60000;
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
