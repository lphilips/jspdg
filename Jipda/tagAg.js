
function createTagAg()
{
var tagAg = {};

  tagAg.toString = function () {return "tagAg"};

  tagAg.object =
    function (node, time)
    {
      return "obj@"+node.tag;
    }

  tagAg.closure =
    function (node, benva, store, kont, c)
    {
      return "clo@"+node.tag;
    }

  tagAg.closureProtoObject =
    function (node, benva, store, kont, c)
    {
      // +"-proto" to avoid clash with 'closure'
      return "pro@"+node.tag;
    }

  tagAg.array =
    function (node, time)
    {
//      return "arr@"+node.tag;
      return "arrcons@0";
    }

  tagAg.string =
    function (node, time)
    {
      return "str@" + node.tag;
    }

//  tagAg.benv =
//    function (node, benva, store, kont)
//    {
//      // + "-env" to avoid clash with 'constructor':
//      // 'new' allocates benv (this function) and new object ('constructor' function)
//      // where 'node' is the application at the moment
//      return "env@"+node.tag;
//    }

  tagAg.constructor =
    function (node, time)
    {
      return "ctr@"+node.tag;
    }
  
  tagAg.vr =
    function (name, ctx)
    {
      return name + "@" + ctx;
    }
  

  
  return tagAg;
}
