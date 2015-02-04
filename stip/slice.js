var toCode = function (option, slicednodes, node) {
	switch (option.target) {
		case 'normal':
			return JSify.transpile(slicednodes, node, option.cps)
		case 'meteor':
			return Meteorify.transpile(slicednodes, node)
		case 'node.js':
			return nodeify(slicednodes, node)
	}
}

var addPrimitives = function (option) {
	switch (option) {
		case 'normal':
			// TODO'
			return[];
		case "meteor":
			return meteorPrimitives();
	}
}

var addFooter = function (option, sliced) {
	switch (option.target) {
		case 'node.js':
			if(option.tier === 'client')
				sliced.footer = nodeFooterC();
			else 
				sliced.footer = nodeFooterS();
	}
	return sliced;
}

var addHeader = function (option, sliced) {
	switch (option.target) {
		case 'node.js':
			if(option.tier === 'client')
				sliced.setup = sliced.setup.concat(nodeHeaderC());
			else
				sliced.setup = sliced.setup.concat(nodeHeaderS());
	}
	return sliced;
}

/*
 * Transformation needed on the body code
 */
var transformBody = function (option, slicing, body, methods) {
	switch (option.target) {
		case 'node.js':
			if (option.tier === 'client') {
				/* client code for node.js runs inside a fiber */
				var fiberf = nodeClientFiber(),
					fiberb = fiberf.declarations[0].init.body.body;
				fiberf.declarations[0].init.body.body = fiberb.concat(body); 
				return fiberf
			}
			else {
				/* server rpcs are added */
				var server = nodeCreateServer();
				server.declarations[0].init.arguments[0].properties = slicing.methods;
				body = body.addFirst(server);
				return body;
			}
		case 'meteor':
			if (option.tier === 'server') {
				/* remote procedure definitions are added */
				var methodsDecl = MeteorParse.methodsServer();
				methodsDecl.expression.arguments = methods;
				body = body.concat(methodsDecl)
				return body
			}
			if (option.tier === 'client') {
				/* remote procedure definitions are added */
				var methodsDecl = MeteorParse.methodsClient();
				methodsDecl.expression.arguments = methods;
				body = body.concat(methodsDecl);
				return body
			}
	}
	return body
}

/* 
 * Starting from a set of nodes, create the corresponding transformed code.
 * This function also adds header and footer code, depending on the choosen output
 */
var constructProgram = function (nodes, option) {
	var program = { 'type' : 'Program',
					'body' : [] 
				  },
		slicing, 
		methods = [];
	//program.body = addPrimitives(option);
	while (nodes.length > 0) {
		var n = nodes.shift();
		if(n.parsenode) {
			slicing = toCode(option, nodes, n);
			if(slicing.parsednode) {
				program.body = program.body.concat(slicing.parsednode);
			}
			nodes = slicing.nodes;	
			methods = methods.concat(slicing.methods);
		}
	};

	addHeader(option, slicing);
	addFooter(option, slicing);
	program.body = transformBody(option, slicing, program.body, methods);
	program.body = slicing.setup.concat(program.body).concat(slicing.footer);
	console.log(program);

	return program;
}

var Sliced = function (nodes, node, parsednode) {
	this.nodes 		 = nodes;
	this.node 		 = node;
	this.parsednode  = parsednode;

	this.setup 		 = [];
	this.footer		 = [];
    
    this.method 	 = {};
    this.methods 	 = [];
    this.streams 	 = [];
}

var cloneSliced = function (sliced, nodes, node) {
	var clone = new Sliced(nodes, node);
	clone.methods = sliced.methods;
	clone.setup   = sliced.setup;
	clone.streams = sliced.streams;
	return clone;
}

var setUpContains = function (sliced, name) {
	return sliced.setup.filter(function (pars) {
		return pars.type === "VariableDeclaration" && 
			pars.declarations[0].id.name === name
	}).length > 0;
}
