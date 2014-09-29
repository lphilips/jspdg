var uncomment = function (fn){
  var multiline = fn.toString().split(/\/\*\n|\n\*\//g).slice(1,-1).join();
  return multiline.replace("@client", "/* @client */").replace("@server", "/* @server */")
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
var factor = 9 / 5;
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
  var celcius = temperature() * 9 / 5 + 32;
  // Update UI
  print('tmp', read('tmp') + celcius);
  if (celcius > 20) 
    print('txt', 'It is rather hot today');
  else
    print('txt', 'It is rather cold today');
}
*/})

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
*/
})

var tiersplittxt = ['Basic', 'Temperature', 'Callback Hell'];
var tiersplitexs = [example1, example3, example4];
var slicetxt = ['Data dependencies']
var sliceexs = [example2]