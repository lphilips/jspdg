var __conca__ = 0;

function createConcAg()
{
  var concreteAg = {};
  concreteAg.toString = function () {return "concAg"};
  
  function storeToAddr(store)
  {
    return String();
  }

  // the prefixes are necessary for when a CESK step generates more than one address
  // without allocating it in the store
  // (other solution: cache next steps so that generated addresses are stable)
  
  concreteAg.object =
    function (node, benva, store, kont)
    {
      return "obj@"+(__conca__++);
    }

  concreteAg.closure =
    function (node, benva, store, kont)
    {
      return "clo@"+(__conca__++);
    }

  concreteAg.closureProtoObject =
    function (node, benva, store, kont)
    {
      return "pro@"+(__conca__++);
    }

  concreteAg.array =
    function (node, benva, store, kont)
    {
      return "arr@"+(__conca__++);
    }

  concreteAg.string =
    function (node, benva, store, kont)
    {
      return "str@"+(__conca__++);
    }

  concreteAg.benv =
    function (node, benva, store, kont)
    {
    print("env@"+store.map.size());
      return "env@"+(__conca__++);
    }

  concreteAg.constructor =
    function (node, benva, store, kont)
    {
      return "ctr@"+(__conca__++);
    }
  
  concreteAg.vr =
    function (name, ctx)
    {
      return name+"@"+(__conca__++);
    }
  
  return concreteAg;
}
