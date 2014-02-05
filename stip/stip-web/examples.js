var sliceTier1 = 'var a = 1;\n\
var b = 2;\n\
/* @server */\n\
{\n\
  var foo = function (x) {\n\
      return x + a;\n\
  }\n\
  foo(a);\n\
}\n\
\n\
/* @client */\n\
{\n\
    var clientonly = 42;\n\
    var c = foo(b) + 3;\n\
    var d = clientonly * 2;\n\
    var e = c / 2;\n\
}'