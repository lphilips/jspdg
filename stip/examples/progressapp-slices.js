/*  @require [fs later]
    @config data: server, setup: server, displayMeetings: client, displayTasks: client
    @slice data
*/
{
    /* @replicated */
    var meetings = [];
    /* @replicated */
    var tasks = [];
    /* @replicated */
    var courses = [];

    /* @replicated */
    function Meeting(title, notes, time) {
        this.title = title;
        this.notes = notes;
        this.start = new Date(time).getTime();
        this.end = addMinute(new Date(time), 120);
    }

    /* @replicated */
    function Task(title, priority) {
        this.title = title;
        this.status = -1;
        this.priority = priority;
    }

    /* @replicated */
    function Course(title, duration, time) {
        this.title = title;
        this.duration = duration;
        this.time = time;
    }
}

/* @slice setup */
{

    tasks.push(new Task("Learn uni-corn!"));

	var dataCourses = fs.readFile('data.json');
	var coursesJSON = JSON.parse(dataCourses);
	coursesJSON.forEach(function (json) {
	    if (!isValidTimeDescr(json.time))
	        throw new Error('Wrong time description in course');
		var course = new Course(json.title, json.duration, json.time);
		courses.push(course);
	})
}

/* @slice time */
{
    later.date.localTime();

    function isValidTimeDescr (descr) {
        var sched = later.parse.text(descr);
        // no error => -1
        return sched.error === -1;
    }

    function happenedInPast(date) {
        var now = new Date().getTime();
        return date < now;
    }

    function addMinutes(date, minutes) {
        var ms = date.getTime();
        return new Date(ms + minutes * 60000);
    }

    function calculateNext(timeDescription) {
        var parsed = later.parse.text(timeDescription);
        var s = later.schedule(parsed);
        var next = s.next(1);
        return new Date(next);
    }

    function calculatePrevious(timeDescription) {
        var parsed = later.parse.text(timeDescription);
        var s = later.schedule(parsed);
        var next = s.prev(1);
        return new Date(next);
    }

    function happenedToday(date1, date2) {
        var year1 = date1.getFullYear();
        var year2 = date2.getFullYear();
        var month2 = date2.getMonth();
        var month1 = date1.getMonth();
        var day1 = date1.getDay();
        var day2 = date2.getDay();
        return year1 == year2 && month1 == month2 && day1 == day2;
    }
}


/* @slice statistics */
{
    var activityToday = 0;
    var latestUpdate = false;

    function updateActivity () {
        var now = new Date();
        if (latestUpdate) {
            if (happenedToday(latestUpdate, now)) {
                activityToday = activityToday + 1;
                latestUpdate = now;
            } else {
                activityToday = 1;
                latestUpdate = now;
            }
        } else {
            latestUpdate = now;
            activityToday = activityToday + 1;
        }
    }

    function processMeetingMonths () {
        var currYear = new Date().getFullYear();
        var months = [0,0,0,0,0,0,0,0,0,0,0,0];
        meetings.forEach(function (meeting) {
            var date = new Date(meeting.start);
            var month = date.getMonth();
            var year = date.getFullYear();
            if (year == currYear)
                months[month] = months[month] + 1;
        });
        return months;
    }


    function processTasksStatus () {
        var todo = 0;
        var finished = 0;
        var inprogress = 0;
        tasks.forEach(function (task) {
            if (task.status < 0) {
                todo++;
            }
            else if (task.status > 0) {
                finished++;
            }
            else {
                inprogress++;
            }
        });
        return [todo, finished, inprogress]
    }
}

/* @slice displayMeetings */
{
    var meetingTitle = "";
    var meetingDate  = "";
    var meetingNotes = "";
    var currentlyEditingM = "";


    function addMeeting() {
        if (currentlyEditingM) {
            currentlyEditingM.title = meetingTitle;
            currentlyEditingM.start = meetingDate;
            currentlyEditingM.notes = meetingNotes;
            currentlyEditingM = false;
        } else {
            meetings.push(new Meeting(meetingTitle, meetingNotes, meetingDate));
        }
        meetings.sort(function (m1, m2) {
            var first = m1.start;
            var second = m2.start;
            return first - second;
        })
        meetingTitle = "";
        meetingDate = "";
        meetingNotes = "";
    }

    function editMeeting(ev) {
        var idx = ev.index;
        currentlyEditingM = meetings[idx];
        var dateS = currentlyEditingM.start;
        meetingTitle = currentlyEditingM.title;
        meetingNotes = currentlyEditingM.notes;
        meetingDate = new Date(dateS);
    }

}

/* @slice displayTasks */
{
    var taskTitle = "";
    var taskPriority = "";


    function addTask() {
        tasks.push(new Task(taskTitle, taskPriority));
        tasks.sort(function (t1, t2) {
            if (t1.status == t2.status) {
                return t1.priority - t2.priority;
            } else {
                return t1.status - t2.status;
            }
        })
        taskTitle = "";
        taskPriority = "";
    }

    function nextStatusTask (ev) {
        var idx = ev.index;
        var task = tasks[idx];
        var now = new Date();
        if (task.status < 1) {
            task.status = task.status + 1;
            task.lastUpdate = now.getTime();
        }
        updateActivity();
    }
}


/* @slice displayCharts */
{
    function createTaskChart () {
        var stats = processTasksStatus();
        var todo = {name: 'to start', y: stats[0]};
        var finished = {name: 'finished', y: stats[1]};
        var inprogress = {name: 'in progress', y: stats[2]};
        var chart = {
            chart: {type: 'pie', options3d: {
                enabled: true,
                alpha: 45
            }},
            title: {text: 'Tasks'},
            plotOptions: { pie: { innerSize: 100, depth: 45 }},
            colors: ['#249AA7', '#ABD25E', '#F1594A', '#F8C830'],
            series: [{
                name: 'Tasks',
                data: [finished, todo, inprogress]
            }]
        }
        $("#chartscontainer").highcharts(chart);
    }

    function createMeetingChart() {
        var options = Highcharts.getOptions();
        var months = processMeetingMonths();
        var chart =  {
            chart: {type:'column', options3d: {enabled:true, alpha:10, beta:25, depth:70} },
            title: {text: 'Meetings this year'},
            colors: ['#249AA7', '#ABD25E', '#F1594A', '#F8C830'],
            plotOptions: {column: {depth: 25}},
            xAxis: {categories: options.lang.shortMonths},
            yAxis: { title: { text: null}},
            series: [{
                name: 'Meetings',
                data: months
            }]
        };
        $("#chartmeetingcontainer").highcharts(chart);
    }

    function createCharts() {
        createTaskChart();
        createMeetingChart();
    }
}

/* @slice displaySchedule */
{


    function displaySchedule() {
        var schedule = [];
        meetings.forEach(function (appointment) {
            appointment.class= "event-info";
            schedule.push(appointment);
        });
        courses.forEach(function (course) {
            var nextDate = calculateNext(course.time);
            var prevDate = calculatePrevious(course.time);
            var endNextDate = addMinutes(nextDate, course.duration);
            var endPrevDate = addMinutes(prevDate, course.duration);
            var next = {title: course.title, start: nextDate.getTime(), end: endNextDate.getTime(), class: "event-info"};
            var prev = {title: course.title, start: prevDate.getTime(), end: endPrevDate.getTime(), class: "event-info"};
            schedule.push(next);
            schedule.push(prev);
        });
        var calendar = $("#calendar").calendar({
            tmpl_path : "tmpls/",
            view : "week",
            events_source: schedule
        });
        calendar.view();
    }
}

/* @ui */
head
	title Uni-corn
	link[rel=stylesheet][href=css/bootstrap.min.css]
	link[rel=stylesheet][href=css/bootstrap-theme.min.css]
	link[rel=stylesheet][href=css/font-awesome.min.css]
	link[rel=stylesheet][href=css/animate.css]
	link[rel=stylesheet][href=css/style.css]
	link[rel=stylesheet][href=css/bootstrap-datetimepicker.min.css]
	link[rel=stylesheet][href=css/calendar.css]
	link[rel=stylesheet][href=http://fonts.googleapis.com/css?family=Lobster]
	script[src=js/moment.js]
	script[src=js/later.min.js]
	script[src=js/transition.js]
	script[src=js/collapse.js]
	script[src=js/bootstrap.min.js]
	script[src=js/bootstrap-datetimepicker.js]
	script[src=js/jquery.appear.js]
	script[src=js/jqBootstrapValidation.js]
	script[src=js/modernizr.custom.js]
	script[src=js/highcharts.js]
	script[src=js/highcharts-3d.js]
	script[src=js/highcharts-more.js]
	script[src=js/modules/exporting.js]
	script[src=js/underscore-min.js]
	script[src=js/calendar.js]
body

	section#logo-section[class=text-center]
		div[class=container]
			div[class=row]
				div[class=col-md-12]
					div[class=logo text-center]
						h1 Uni-corn
						span Managing your uni-versity career
	div[class=mainbody-section text-center]
		div[class=container]
			div[class=row]
				div[class=col-md-3]
					div[class=menu-item blue]
						a[href=#calendar-modal][data-toggle=modal][@click=displaySchedule]
							i[class=fa fa-calendar]
							p Schedule
					div[class=menu-item green]
						a[href=#tasks-modal][data-toggle=modal]
							i[class=fa fa-tasks]
							p Tasks
				div[class=col-md-6]
					img[src=images/unicorn.png][class=img-responsive]
				div[class=col-md-3]
					div[class=menu-item light-red]
						a[href=#meetings-modal][data-toggle=modal]
							i[class=fa fa-envelope-o]
							p Meetings
					div[class=menu-item color]
						a[href=#progress-modal][data-toggle=modal][@click=createCharts]
							i[class=fa fa-pie-chart]
							p Progress

	div#calendar-modal[class=section-modal modal fade][tab-index=-1][role=dialog][aria-hidden=true]
		div[class=modal-content]
			div[class=close-modal][data-dismiss=modal]
				div[class=lr]
					div[class=rl]
			div[class=container]
				div[class=row]
					div[class=section-title text-center]
						h3 Your Awesome Calendar
						p Always be yourself. Unless you can be a unicorn, then always be a unicorn.
				div[class=row]
					div[class=pull-right form-inline]
						div[class=btn-group]
							button[class=btn btn-warning][data-calendar-view=year] Year
							button[class=btn btn-warning][data-calendar-view=month] Month
							button[class=btn btn-warning active][data-calendar-view=week] Week
							button[class=btn btn-warning][data-calendar-view=day] Day
				div[class=row]
					div[class=row]
						div#calendar
	div#tasks-modal[class=section-modal modal fade][tab-index=-1][role=dialog][aria-hidden=true]
		div[class=modal-content]
			div[class=close-modal][data-dismiss=modal]
				div[class=lr]
					div[class=rl]
			div[class=container]
				div[class=row]
					div[class=section-title text-center]
						h3 Tasks
						p Being a person is getting too complicated. Time to be a unicorn.
				div[class=row]
					div[class=col-md-8]
						ul[class=timeline]
							{{#each tasks}}
								li[data-idx = {{__idx__}}][class={{status < 1 ? "timeline-inverted" : ""}}]
									{{#if status == 1}}
										div[class=timeline-badge info]
											i[class=glyphicon glyphicon-check]
									{{#else}}
										{{#if status == 0}}
											div[class=timeline-badge warning]
												i[class=glyphicon glyphicon-edit]
										{{#else}}
											div[class=timeline-badge danger]
												i[class=glyphicon glyphicon-road]
									div[class=timeline-panel]
										div[class=timeline-heading]
											h4[class=timeline-title] {{title}}

										div[class=timeline-body]
											button[@click=nextStatusTask][class=btn btn-info btn-sm]
												i[class=glyphicon glyphicon-check]


					div[class=col-md-4]
						a[class=btn btn-default]
							span[class=glyphicon glyphicon-pencil]
						div#task-form[class=form-horizontal]
							div[class=form-group]
								label[for=task-title][class=control-label sr-only] Title
								div[class=col-sm-10]
									input[value={{taskTitle}}][class=form-control][placeholder=Title]
							div[class=form-group]
								label[for=taskPriority][class=control-label sr-only] Priority
								div[class=col-sm-10]
									input[value={{taskPriority}}][class=form-control][placeholder=Priority (0-...)]
							div[class=form-group]
								div[class=col-sm-offset-2 col-sm-10]
									button[@click=addTask][class=btn btn-success]#send
										i[class=glyphicon glyphicon-floppy-disk]

	div#meetings-modal[class=section-modal modal fade][tab-index=-1][role=dialog][aria-hidden=true]
		div[class=modal-content]
			div[class=close-modal][data-dismiss=modal]
				div[class=lr]
					div[class=rl]
			div[class=container]
				div[class=row]
					div[class=section-title text-center]
						h3 Meetings
						p Everything is better with a unicorn
				div[class=row]
					div[class=col-md-8]
						ul[class=timeline]
							{{#each meetings}}
								li[data-idx = {{__idx__}}][class={{happenedInPast(start) ? "timeline-inverted" : ""}}]
									{{#if happenedInPast(start)}}
										div[class=timeline-badge info]
											i[class=glyphicon glyphicon-check]
									{{#else}}
										div[class=timeline-badge danger]
											i[class=glyphicon glyphicon-road]
									div[class=timeline-panel]
										div[class=timeline-heading]
											h4[class=timeline-title] {{title}}
											p
												small[class=text-muted] {{start.toLocaleString()}}
										div[class=timeline-body]
											p {{notes}}
											button[@click=editMeeting][class=btn btn-info btn-sm]
												i[class=glyphicon glyphicon-edit]


					div[class=col-md-4]
						a[class=btn btn-default]
							span[class=glyphicon glyphicon-pencil]
						div#meeting-form[class=form-horizontal]
							div[class=form-group]
								label[for=meeting-title][class=control-label sr-only] Title
								div[class=col-sm-10]
									input[value={{meetingTitle}}][class=form-control][placeholder=Title]
							div[class=form-group]
								div#meeting-starttime[class=input-group date col-sm-8][style=padding-left:15px]
									input#meeting-start[type=text][class=form-control][value={{meetingDate}}]
									span[class=input-group-addon]
										span[class=glyphicon glyphicon-calendar]
							div[class=form-group]
								label[for=meeting-description][class=control-label sr-only] Notes
								div[class=col-sm-10]
									textarea#meeting-description[class=form-control][rows=3][value={{meetingNotes}}]
							div[class=form-group]
								div[class=col-sm-offset-2 col-sm-10]
									button[@click=addMeeting][class=btn btn-success]#send
										i[class=glyphicon glyphicon-floppy-disk]

	div#progress-modal[class=section-modal modal fade][tab-index=-1][role=dialog][aria-hidden=true]
		div[class=modal-content]
			div[class=close-modal][data-dismiss=modal]
				div[class=lr]
					div[class=rl]
			div[class=container]
				div[class=row]
					div[class=section-title text-center]
						h3 Progress
						p If someone says you're not a unicorn don't talk to them. You do not need that kind of negativity in your life.
				div[class=row]
					div[class=text-center col-md-4 col-md-offset-4]
						{{#if activityToday > 1}}
							h4 You updated {{activityToday}} tasks today! Quite the busy bee! Ehm, unicorn!
						{{#else}}
							h4 You updated {{activityToday}} tasks today. You may have stopped believing in unicorns, but they never stopped believing in you!
					div#chartscontainer[class=col-md-5]
					div#chartmeetingcontainer[class=col-md-5]

	script[src=js/aux.js]