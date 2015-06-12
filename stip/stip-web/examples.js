var Examples =  (function () {


  var module = {};

  var assumesval = "["

  var uncomment = function (fn){
    var multiline = fn.toString().split(/\/\*\n|\n\*\//g)[1];
    return multiline
      .replace("@client", "/* @client */")
      .replace("@server", "/* @server */")
      .replace("@assumes", "/* @assumes")
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
    btn.onClick( function () {
        var msg = text.value();
        broadcast(name, msg)
    });
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
  var celcius = temperature() * factor() + add;
  // Update UI
  print('tmp', read('tmp') + celcius);
  if (celcius > 20) 
    print('txt', 'It is rather hot today');
  else
    print('txt', 'It is rather cold today');
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

  module.tiersplittxt = ['Chat', 'Basic', 'Temperature', 'Callback Hell'];
  module.tiersplitexs = [chatexample, example1, example3, example4];
  module.slicetxt = ['Data dependencies']
  module.sliceexs = [example2]


  return module


})()