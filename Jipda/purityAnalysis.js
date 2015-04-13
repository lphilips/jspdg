function PurityAnalysis(etg, ecg, initial)
{
  this.etg = etg;
  this.ecg = ecg;
  this.dynamicExtents = PurityAnalysis.dynamicExtents(initial, etg, ecg);
}

PurityAnalysis.prototype.functions =
  function ()
  {
    return this.dynamicExtents.keys();
  }

PurityAnalysis.prototype.isPure =
  function (f)
  {
    return PurityAnalysis.isPure(this.etg, this.ecg, this.dynamicExtents)(f);
  }

PurityAnalysis.dynamicExtents = // returns map: fun -> apps -> edges
  function (s, etg, ecg)
  {
    var todo = [[s, []]];
    var visited = HashSet.empty();
    var map = HashMap.empty();
    while (todo.length > 0)
    {
      var item = todo.shift();
      if (visited.contains(item))
      {
        continue;
      }
      visited = visited.add(item);
      var state = item[0];
      var ss = item[1];
      var es = etg.outgoing(state);
      map = ss.reduce(
        function (map, app)
        {
          var f = app.g.frame.node;
          var extents = map.get(f) || HashMap.empty();
          extents = extents.put(app, (extents.get(app) || ArraySet.empty()).addAll(es));
          return map.put(f, extents);
        }, map);
      es.forEach(
        function (e)
        {
          if (!Dsg.isPopEdge(e))
          {
            var ss2 = PurityAnalysis.isApp(e) ? ss.addUniqueLast(e) : ss; 
            todo.push([e.target, ss2]);
          }
        });
      var ht = ecg.successors(state);
      ht.forEach(
        function (t)
        {
          todo.push([t, ss]);
        });
    }
    return map;
  }
  
  
PurityAnalysis.isApp =
  function (transition)
  {
    return transition.g && transition.g.isPush && transition.g.frame.isMarker;
  }

PurityAnalysis.isAppOf =
  function (f)
  {
    return function (transition)
    {
      return PurityAnalysis.isApp(transition) && transition.g.frame.node === f;
    }
  }

PurityAnalysis.effectsOf =
  function (transition)
  {
    return transition.marks || [];
  }

PurityAnalysis.addressesReachable =
  function (state) 
  {
    var rootSet = state.q.addresses().concat(state.ss.addresses());
    var result = Agc.addressesReachable(rootSet, state.q.store, []);
    return result;
  }

PurityAnalysis.isPureWrite =
  function (callerState)
  {
    return function (effect)
    {
      return !Arrays.contains(effect.address, callerState);
    }
  }

PurityAnalysis.isPureRead =
  function (etg, ecg, e, ea, xa, xf)
  {
    return function (effect)
    {
      var address = effect.address;
      var name = effect.name;
      var fwR1 = Dsg.efwReachable(etg, ecg)(e);
      var fwR2 = fwR1.filter(
        function (edge)
        {
          if (Arrays.contains(edge, xa))
          {
            return false;
          }
          var effects = PurityAnalysis.effectsOf(edge);
          return effects.some(
            function (effect)
            {
              return effect.operation === Effect.Operations.WRITE
                && effect.address.equals(address)
                && effect.name.equals(name)
            })
        });
//      print("reaching writes outside extent", fwR2.map(function (e) {return e.index}));
      var fwR3 = fwR2.flatMap(Dsg.efwReachable(etg, ecg));
      var fwR4 = fwR3.filter(
        function (edge)
        {
          var effects = PurityAnalysis.effectsOf(edge);
          return effects.some(
            function (effect)
            {
              return effect.operation === Effect.Operations.READ
                && effect.address.equals(address)
                && effect.name.equals(name)
            })
        });
      var reaches = fwR4.some(
        function (rr)
        {
          return Arrays.contains(rr, xf);
        }); 
//      print("reaching reads", fwR4.map(function (e) {return e.index}), "cover", cover.map(function (e) {return e.index}), "reaches?", reaches);
      return !reaches;
    }
  }

//PurityAnalysis.isPureEffect =
//  function (etg, ecg, e, ea, xa, xf)
//  {
//    var callerState = PurityAnalysis.addressesReachable(ea.source);
//    return function (effect)
//    {
//  //    print("+++ effect", appEffect);
//      var operation = effect.operation;
//      var address = effect.address;
//      if (operation === Effect.Operations.WRITE)
//      {
//  //      print("address", address, "in caller state?", Arrays.contains(address, callerState))
//        return PurityAnalysis.isPureWrite(callerState)(effect);
//      }
////      if (operation === Effect.Operations.READ)
////      {
////        var name = effect.name;
////        return PurityAnalysis.isPureRead(etg, ecg, e, ea, xa, xf)(effect);
////      }
//      return true;
//    }
//  }

PurityAnalysis.isPureApp =
  function (etg, ecg, xf)
  {
    return function (ea, xa)
    {
//      print("*** app", app.index, "app edges", appEdges.map(function (e) {return e.index}), "caller", callerState);
      return xa.every(
        function (e)
        {
          var effects = PurityAnalysis.effectsOf(e);
//          return effects.every(PurityAnalysis.isPureEffect(etg, ecg, e, ea, xa, xf));

          var reffects = [];
          var weffects = [];
          effects.forEach(
            function (effect)
            {
              if (effect.operation === Effect.Operations.WRITE)
              {
                weffects.push(effect);
              }
              else if (effect.operation === Effect.Operations.READ)
              {
                reffects.push(effect);
              }
            });
          
          var callerState = PurityAnalysis.addressesReachable(ea.source);
          return weffects.every(PurityAnalysis.isPureWrite(callerState))
            && reffects.every(PurityAnalysis.isPureRead(etg, ecg, e, ea, xa, xf))
        });
    }
  }

PurityAnalysis.isPure =
  function (etg, ecg, dynamicExtents)
  {
//    var dynamicExtents = PurityAnalysis.dynamicExtents(initialState, etg, ecg);
    return function (f)
    {
      var df = dynamicExtents.get(f) || ArrayMap.empty();
      var xf = df.values().flatMap(function (x) {return x.values()});
//      print("f", f);
      return df.entries().every(
        function (entry)
        {
          var ea = entry.key;
          return PurityAnalysis.isPureApp(etg, ecg, xf)(ea, entry.value.values()); 
        })
    }  
  }
