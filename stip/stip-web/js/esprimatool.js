/*
  Copyright (C) 2013 Ariya Hidayat <ariya.hidayat@gmail.com>
  Copyright (C) 2012 Ariya Hidayat <ariya.hidayat@gmail.com>
  Copyright (C) 2011 Ariya Hidayat <ariya.hidayat@gmail.com>

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

/*jslint sloppy:true browser:true */
/*global esprima:true, YUI:true, require:true */

var parseId, tree;

function id(i) {
    return document.getElementById(i);
}

YUI({ gallery: 'gallery-2013.01.09-23-24' }).use('gallery-sm-treeview', function (Y) {

    window.updateTree = function (syntax) {

        if (typeof syntax === 'undefined') {
            return;
        }

        if (typeof tree === 'undefined') {
            tree = new Y.TreeView({
                lazyRender: false,
                container: '#treeview'
            });
            tree.render();
        }

        function isArray(o) {
            return (typeof Array.isArray === 'function') ? Array.isArray(o) :
                Object.prototype.toString.apply(o) === '[object Array]';
        }

        function convert(name, node) {
            var i, key, item, subitem;

            item = tree.createNode();

            switch (typeof node) {

            case 'string':
            case 'number':
            case 'boolean':
                item.label = name + ': ' + node.toString();
                break;

            case 'object':
                if (!node) {
                    item.label = name + ': null';
                    return item;
                }
                if (node instanceof RegExp) {
                    item.label = name + ': ' + node.toString();
                    return item;
                }
                item.label = name;
                if (isArray(node)) {
                    if (node.length === 2 && name === 'range') {
                        item.label = name + ': [' + node[0] + ', ' + node[1] + ']';
                    } else {
                        item.label = item.label + ' [' + node.length + ']';
                        for (i = 0; i < node.length; i += 1) {
                            subitem = convert(String(i), node[i]);
                            if (subitem.children.length === 1) {
                                item.append(subitem.children[0]);
                            } else {
                                item.append(subitem);
                            }
                        }
                    }

                } else {
                    if (typeof node.type !== 'undefined') {
                        item.label = name;
                        subitem = tree.createNode();
                        subitem.label = node.type;
                        item.append(subitem);
                        for (key in node) {
                            if (Object.prototype.hasOwnProperty.call(node, key)) {
                                if (key !== 'type') {
                                    subitem.append(convert(key, node[key]));
                                }
                            }
                        }
                    } else {
                        for (key in node) {
                            if (Object.prototype.hasOwnProperty.call(node, key)) {
                                item.append(convert(key, node[key]));
                            }
                        }
                    }
                }
                break;

            default:
                item.label = '[Unknown]';
                break;
            }

            return item;
        }


        tree.clear();
        document.getElementById('treeview').innerHTML = '';
        tree.rootNode.append(convert('Program body', syntax.body));
        tree.render();

    };

});




function esprimaparse() {
    if (parseId) {
        window.clearTimeout(parseId);
    }

    var code,result, el, str;


    code = editor.getSession().getValue();

        // Special handling for regular expression literal since we need to
        // convert it to a string literal, otherwise it will be decoded
        // as object "{}" and the regular expression would be lost.
        function adjustRegexLiteral(key, value) {
            if (key === 'value' && value instanceof RegExp) {
                value = value.toString();
            }
            return value;
        }

        try {
            result = esprima.parse(code);
            str = JSON.stringify(result, adjustRegexLiteral, 4);
            if (window.updateTree) {
                window.updateTree(result);
            }
        } catch (e) {
            if (window.updateTree) {
                window.updateTree();
            }
            str = e.name + ': ' + e.message;
        }

        el = id('syntax');
        el.value = str;

}
