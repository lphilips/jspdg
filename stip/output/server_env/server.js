var express = require('express'), app = express();
var ServerData = require('./rpc/data-server.js');
var server = new ServerData(app, 3000);
app.use('/client', express.static(__dirname + '/../client_env/js'));
app.use('/', express.static(__dirname + '/../client_env'));
var meetings;
var tasks;
var courses;
var coursesJSON;
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
function Course(id, title, start, end) {
    function Course(title, start, end) {
        this.title = title;
        this.start = new Date(start).getTime();
        this.end = new Date(end).getTime();
    }
    return server.makeReplicatedObject(id, new Course(title, start, end));
}
meetings = server.makeReplicatedObject('meetings', []);
tasks = server.makeReplicatedObject('tasks', []);
function anonf1(json) {
    var course;
    course = new Course('course', json.title, json.start, json.end);
    courses.push(course);
}
courses = server.makeReplicatedObject('courses', []);
coursesJSON = [
    {
        title: 'Structuur 1 Exam',
        start: 'January 10, 2017 09:00:00',
        end: 'January 10, 2017 13:00:00'
    },
    {
        title: 'Structuur 1 Oral exam',
        start: 'January 12, 2017 10:00:00',
        end: 'January 12, 2017 18:00:00'
    },
    {
        title: 'Structuur 1 Oral exam',
        start: 'January 15, 2017 10:00:00',
        end: 'January 15, 2017 18:00:00'
    }
];
tasks.push(new Task(false, 'Learn uni-corn!'));
coursesJSON.forEach(anonf1);
