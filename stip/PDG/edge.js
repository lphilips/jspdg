/******************************************** 
*   Distributed program dependency graph    *
*                                           *
*               EDGE                        *
*                                           *
*  - type   (one of EDGES)                  *
*  - from   (Node)                          *
*  - to     (Node)                          *
*  - label  (boolean)                       *
*********************************************/

var EDGES = {
  CONTROL       : {value: 0,  name: 'control'       },
  DATA          : {value: 1,  name: 'data'          },
  SUMMARY       : {value: 2,  name: 'summary'       },
  CALL          : {value: 3,  name: 'call'          },
  PARIN         : {value: 4,  name: 'par-in'        },
  PAROUT        : {value: 5,  name: 'par-out'       },
  OBJMEMBER     : {value: 6,  name: 'object member' },
  REMOTED       : {value: 7,  name: 'remote data'   },
  REMOTEC       : {value: 8,  name: 'remote call'   },
  REMOTEPARIN   : {value: 9,  name: 'remote par-in' },
  REMOTEPAROUT  : {value: 10, name: 'remote par-out'},
  PROTOTYPE     : {value: 11, name: 'prototype'},
}

function PDG_Edge (from, to, type, label) {
    this.from = from;
    this.to   = to;
    this.type = type;
    this.label = label;
}

PDG_Edge.prototype.equalsType = function (etype) {
  return this.type.value === etype.value
}


PDG_Edge.prototype.equals = function (e) {
  return this.from.equals(e.from) &&
         this.to.equals(e.to) &&
         this.type.value === e.type.value;
}

/* Parameter passing 
 * has an extra field for value of parameter */
Parameter_Edge = function Parameter_Edge (from, to, value) {
   PDG_Edge.call(this, from, to, EDGES.PARBIND); 
   this.value = value;
}

Parameter_Edge.prototype = new PDG_Edge();



if (typeof module !== 'undefined' && module.exports != null) {
    exports.PDG_Edge = PDG_Edge;
    exports.EDGES = EDGES;
    exports.Parameter_Edge = Parameter_Edge;
}

