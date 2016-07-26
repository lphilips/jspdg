"use strict";   

function createComponentGraph (PDG) {
      var edges = [];
      var nodes = [];
      var edgeId = 0;
      nodes = PDG.getFunctionalityNodes();

      nodes.map(function (node) {
        var depCNodes = node.getFNodes();
        depCNodes.map(function (cnode) {
          var remoteCalls = node.countEdgeTypeTo(EDGES.REMOTEC, cnode);
          var remoteData  = node.countEdgeTypeTo(EDGES.REMOTED, cnode);
          while (remoteCalls > 0) {
            edges.push({
              data : {
                id : edgeId++,
                label: "CALL",
                source: node.ftype,
                target: cnode,
                directed: true,
                color: "#F9D9B1",
              }
            });
            remoteCalls--;
           }
          while (remoteData > 0) {
            edges.push({
              data : {
                id: edgeId++,
                label: "DATA",
                source: cnode,  // Data = other way around!
                target: node.ftype,
                directed: true,
                color: "#B5E1E6",
              }
            });
            remoteData--;
           }
        });
      });

      var states = nodes.map(function (node, id) {
          return {
            data : {
              id: node.ftype,
              name: node.ftype
            }
          }
      });
      var cy = cytoscape({
        container : $("#componentgraph"),
        elements  : states.concat(edges),
        layout    : {
          name        : 'cose',
          directed    : true
        },

        style: [
          { 
            "selector":"core",
            "style":{
              "selection-box-color":"#AAD8FF",
              "selection-box-border-color":"#8BB0D0",
              "selection-box-opacity":"0.5"}
          },
          {
            "selector":"node",
            "style":{
              "width":"mapData(score, 0, 0.006769776522008331, 20, 60)",
              "height":"mapData(score, 0, 0.006769776522008331, 20, 60)",
              "content":"data(name)",
              "font-size":"10px",
              "text-valign":"center","text-halign":"center",
              "background-color":"#555",
              "text-outline-color":"#555",
              "text-outline-width":"2px",
              "color":"#fff",
              "overlay-padding":"6px",
              "z-index":"10"}
          },
          {
            "selector":"node[?attr]",
            "style":{
              "shape":"rectangle",
              "background-color":"#aaa",
              "text-outline-color":"#aaa",
              "width":"16px",
              "height":"16px",
              "font-size":"6px",
              "z-index":"1"}
          },
          {
            "selector":"node[?query]",
            "style":{
              "background-clip":"none",
              "background-fit":"contain"}
          },{
            "selector":"edge",
            "style":{
              "curve-style":"haystack",
              "haystack-radius":"0.5",
              "opacity":"0.8",
              "line-color":"data(color)",
              //"width":"mapData(weight, 0, 1, 1, 8)",
              "overlay-padding":"4px",
              "mid-target-arrow-shape": "triangle",
              "mid-target-arrow-fill": "hollow"


            }
          },
          ]
      });
      return cy;
}



  