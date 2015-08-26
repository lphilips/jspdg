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
  var serverfunction = function (x) {
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
@assumes [random():Num]
@server 
{
  function broadcast(name, message) {
      displayMessage(name, message);
  }
}
    
@client
  {
    var name = "user"  + random(),
        btn  = $("#btn"),
        text = $("#text");

    function chatHandler () {
       var msg = text.value();
       broadcast(name, msg);
    }
    btn.onClick(chatHandler);
    function displayMessage(name, message) {
        text.value(name + ":said " + message)
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
var factor = function () { return 9/5 };
var add = 32;
@server
{
  var standard = 5;
  var temperature = function () {
    return standard;
  }
}
@client
{
  var tmpDom = $('tmp');
  var txtDom = $('txt');
  var celcius = temperature() * factor() + add;
  // Update UI
  tmpDom.value(tempDom.value() + celcius);
  if (celcius > 20) 
    txtDom.value('It is rather hot today');
  else
    txtDom.value('It is rather cold today');
}
*/});

  var example4 = uncomment( function (){/*
@server
{
	var serverf = function (x) { return x }
}
@client 
{
	var clientf = function (x) { return x };
	var a = clientf(1) + serverf(2)
	var b = serverf(3) + 4 + serverf(5) + clientf(6);
	var c = a + b + serverf(7);
	var d = clientf(serverf(clientf(serverf(c))));
	var e = 42;
}
*/});


  var advancedchat = uncomment( function () {/*
@assumes [random():Num]
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
        var user_id = random();
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
        var msg = msgDom.value();
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
        changeUser(user_id, nameDom.value()); 

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
foo(42);
var a = foo(1);
var b = foo(2);
var c = a * 2;
var d = b * 2;
@blocking
var e = foo(3);
@blocking
var f = foo(4);
@blocking
var g = foo(5);
*/});

  module.tiersplittxt = ['Chat', 'Basic', 'Advanced Chat','Temperature'];
  module.tiersplitexs = [chatexample, example1, advancedchat, example3];
  module.slicetxt = ['Data dependencies']
  module.sliceexs = [example2]
  module.continuationstxt = ['Callback Hell', 'Annotation']
  module.contexs = [example4, example5]



  return module


})()