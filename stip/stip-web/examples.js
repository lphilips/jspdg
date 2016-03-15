var Examples =  (function () {


  var module = {};

  var assumesval = "["

  var uncomment = function (fn){
    var multiline = fn.toString().split(/\/\*\n|\n\*\//g)[1];
    return multiline
      .replace("@client", "/* @client */")
      .replace("@server", "/* @server */")
      .replace("@assumes", "/* @assumes")
      .replace(/@broadcast/g, "/*@broadcast*/")
      .replace("@shared", "/*@shared*/")
      .replace(/@reply/g,"/*@reply*/")
      .replace(/@blocking/g,"/*@blocking*/")
      .replace("]\n/\*", "]\n")
  };

   
  var example1 = uncomment (function (){/*
var a = 1;
var b = 2;
@server
{
  var serveronly = 3;
  function serverfunction (x) {
      return x + a;
  };
  serverfunction(a);
}

@client
{
    var clientonly = 4;
    var c = serverfunction(b) + 3;
    var d = clientonly * 2;
    var e = c / 2;
}
*/});

var chatexample = uncomment (function () {/*
@server 
{
  function broadcast(name, message) {
      displayMessage(name, message);
  }
}
    
@client
  {
    var name = "user"  + Math.random(),
        btn  = $("#btn"),
        text = $("#text");

    function chatHandler () {
       var msg = text.val();
       broadcast(name, msg);
    }
    btn.click(chatHandler);
    function displayMessage(name, message) {
        text.val(name + ":said " + message)
    }
}
*/})

  var example2 = uncomment (function (){/*
var a = 1;
var b = 2;
var c = 3;
var d = 4;
var foo = function() {
	var aa = a * a;
	var bb = b * b;
	var ab = aa + bb;
	return ab
}
var bar = function() {
	var cc = c * c;
	var dd = d * d;
	var cd = cc + dd;
	return cd
}
foo()
bar()
*/});

  var example3 = uncomment (function (){/*
function factor () { 
  return 9/5; 
};
var add = 32;
@server
{
  var standard = 5;
  function temperature () {
    return standard;
  }
}
@client
{
  var tmpDom = $('tmp');
  var txtDom = $('txt');
  var celcius = temperature() * factor() + add;
  // Update UI
  tmpDom.val(tmpDom.val() + celcius);
  if (celcius > 20) 
    txtDom.val('It is rather hot today');
  else
    txtDom.val('It is rather cold today');
}
*/});

  var example4 = uncomment( function (){/*
@server
{
	function serverf(x) { return x }
}
@client 
{
	function clientf(x) { return x };
	var a = clientf(1) + serverf(2)
	var b = serverf(3) + 4 + serverf(5) + clientf(6);
	var c = a + b + serverf(7);
	var d = clientf(serverf(clientf(serverf(c))));
	var e = 42;
}
*/});


  var advancedchat = uncomment( function () {/*
@shared 
 { function userExistsError (msg, name) {
         this.message = msg;
         this.newName = name;
    }
    
    function userError (msg) {
        this.message = msg
    }
    
    function messageError (msg) {
        this.message = msg
    }
}


@server
{
    var ids = [];
    var names = [];

    function broadcast(user_id, msg){
        if(! ids.indexOf(user_id) < 0) 
          throw new userError(user_id + ' not found');
        if(msg.length === 0) 
          throw new messageError('message was empty');

        var idPos = ids.indexOf(user_id);
        var user =  names[idPos];

        @broadcast
        hear(user + "says:" + msg);
        return;
    }

    function registerUser(){
        var user_id = Math.random();
        var name = "user_" + user_id;

        ids.push(user_id);
        names.push(name);

        @broadcast
        hear(name + ' joined'); 

        return user_id;
    }

    function changeUser(user_id, newName){
        var idPos = ids.indexOf(user_id);

        if(names.indexOf(newName) >= 0){
            throw new userExistsError('Username already in use', newName);
        }

        var oldName = names[idPos];
        names[idPos] = newName;

        @reply
        hear('Your name was changed'); 

        @broadcast
        hear(oldName + ' changed to ' + newName); 
        return;

    }
}

@client
{
    
    var user_id;
    var msgDom  = $('#msg');
    var chatDom = $('#chat');
    var nameDom = $('#name');
    var speakDom = $('#speakBtn');
    var nameBDom = $('#nameBtn');

    user_id = registerUser(); 

    function speak(){
    try {
        var msg = msgDom.val();
        broadcast(user_id, msg); 
     }catch(e){
        msgDom.text(e.message);
     }
    }

    function hear(msg){
        chatDom.append( '<div><div>'+ msg +'</div></div>');
    }

    function changeName(){
    try{
        changeUser(user_id, nameDom.val()); 

    } catch(e){
        msgDom.text('Could not change name to ' + e.newName + ': ' + e.message);
    }

    }
    speakDom.click(speak);
    nameBDom.click(changeName);

}
*/})

var example5 = uncomment( function (){/*
var foo = function (x) { return x }
@blocking
{
    foo(42);
    var a = foo(1);
    var b = foo(2);
    var c = a * 2;
    var d = b * 2;
}
@blocking
var e = foo(3);
@blocking
var f = foo(4);
@blocking
var g = foo(5);
*/});

var examplefac = uncomment( function () {/*
function fac (x) {
  if (x == 0)
    return 1;
  else
    return x * fac(x - 1);
}

fac(5);
*/});


var exampleho = uncomment( function () {/*
function square (x) { 
  return x * x; 
} 
function next(x) {  
  return x + 1;
} 
function sum(a, b, term, next) {  
  if (a === b) 
    return term(b);   
  else 
    return term(a) + sum(next(a), b, term, next); 
}

sum(1,5, square, next);
sum(1,3,square, next);
*/});

var exampleCollChat = uncomment( function () {/*
@assumes [setTimeout(fn,ms):null]
@server
{
    var lines = [];

    function addLine (line) {
        lines.push(line);
        @broadcast
        drawLine(line);
    }
}
@client
{
    var canvas = $("#drawing");
    var context = canvas.getContext("2d");
    var width = window.width;
    var height = window.height;
    var mouse = { 
          click: false,
          move: false,
          pos: {x:0, y:0},
          pos_prev: false
    };

    canvas.width = width;
    canvas.height = height;

    function mouseMove (e) {
        mouse.pos.x = e.clientX / width;
        mouse.pos.y = e.clientY / height;
        mouse.move = true;
    }

    function mouseDown (e) {
        mouse.click = true;
    }

    function mouseUp (e) {
        mouse.click = false;
    }

    canvas.onmousemove(mouseMove);
    canvas.onmouseup(mouseUp);
    canvas.onmousedown(mouseDown);
    mouseMove({clientX : 0, clientY : 0});

    function drawLine(line) {
        var begin = line[0];
        var end   = line[1];
        context.beginPath();
        context.lineWidth = 2;
        context.moveTo(begin.x * width, begin.y * height);
        context.lineTo(end.x * width, end.y * height);
        context.stroke();
    }

    function loop () {
        if ( mouse.move && mouse.pos_prev) {
            addLine([mouse.pos, mouse.pos_prev]);
            mouse.move = false;
        }
        mouse.pos_prev = {x : mouse.pos.x, y: mouse.pos.y};
        setTimeout(loop, 25);

    }

    loop();
}
*/});

var tierlessboardgames = uncomment( function () {/*
@server 
{
  function options(path) {
    return {
      hostname: 'bgg-json.azurewebsites.net',
      path : path,
      method: 'GET'
    }
  }
  
  function getHottestGames() {
    var output = '';
    var hottest = https.get(options('/hot'));
    hottest.on('data', function (data) {
      output = output + data;
    });
    hottest.on('end', function () {
      var obj = JSON.parse(output);
      displayHottestGames(obj);
    })
  }
}

@client
{
  function makeTable() {
    return $('<table></table>').addClass('table'); 
  }
  function makeRow() {
    return $('<tr></tr>'); 
  }
  function makeCell(text) {
    return $('<td></td>').text(text); 
  }
  
  function displayHottestGames(games) {
    var table = makeTable(); 
    games = games.slice(10);
    games.forEach(function (game) {
      var row = makeRow();
      var c1 = makeCell(game.name);
      var c2 = makeCell(game.rank);
      var c3 = makeCell(game.thumbnail);
      row.append(c2);
      row.append(c3);
      row.append(c1);
      table.append(row);
    });
    $('#hottestgames').append(table);
  }

  getHottestGames();
}
*/})

var cpsboardgames = uncomment( function () { /*
function options (path) {
  return {
    hostname: 'bgg-json.azurewebsites.net',
    path: path,
    method: 'GET'
  }
}

var latest = https.get(options('/hot'));
latest.on('data', function (d) {
  console.log(d);
});
var friends = ["flippydosk", "swipl"];
friends.forEach(function (friend) {
  var played = https.get(options('/plays'+friend));
  played.on('data', function (d) {
    console.log(d);
  });
});
*/})

  module.tiersplittxt = ['Chat', 'Basic', 'Advanced Chat','Boardgames', 'Temperature'];
  module.tiersplitexs = [chatexample, example1, advancedchat, tierlessboardgames, example3];
  module.slicetxt = ['Data dependencies']
  module.sliceexs = [example2]
  module.continuationstxt = ['Factorial', 'Higher Order', 'Callback Hell', 'Annotation', 'Boardgames']
  module.contexs = [examplefac, exampleho, example4, example5, cpsboardgames]



  return module


})()