/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * **
 * 			CLOUD TYPES	   	   																					*
 *																												*	
 *     Based on JavaScript implementation : https://github.com/ticup/CloudTypes 								*
 *																												*
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * **/


var CTParse = (function () {

	var module = {},

	 /* Jipda Abstract Type -> Cloud Type */
	    CloudTypes = {
			Num : CInt, 
			Str : CString
		};


	/* Cloud Integer */


	var CInt = function (name) {
		var declstrS = "server.declare('" + name + "', CloudTypes.CInt)",
			declstrC = "var " + name + " = state.get('" + name + "')";
			var cint = 
		{
			varname 	  : name,
			/* Server side */
			declarationS  : esprima.parse(declstrS).body[0],
			setServerName : function (sname) {
								this.declarationS.callee.object.name = sname
						  },

			/* Client side */
			declarationC  : esprima.parse(declstrC).body[0],
			get 		  : function () {
	 						  return esprima.parse(name + ".get()").body[0]
						  },
			add			  : function (nr) {
							  return esprima.parse(name + ".add(" + nr + ")").body[0]
						  },
			set 		  : function (exp) {
	                    	  return esprima.parse(name + ".set(" + exp + ")").body[0]        
						  },
			setIfEmpty    : function (exp) {
								return esprima.parse(name + ".setIfEmpty(" + exp + ")").body[0];
						  }
		};
		return cint;

	}


	var CString = function (name) {
		var declstrS = "server.declare('" + name + "', CloudTypes.CString)",
		    declstrC = "state.get('" + name + "')";
		    cstring  = 
		{
			varname 	: name,
			/* Server side */
			declarationS  : esprima.parse(declstrS).body[0],
			setServerName : function (sname) {
								this.declarationS.callee.object.name = sname
						  },
			/* Client side */
			declarationC  : esprima.parse(declstrC).body[0],
			get 		  : function () {
	 						  return esprima.parse(name + ".get()").body[0]
							},
			set 		  : function (str) {
							  return esprima.parse(name + ".set(" + str + ")").body[0]
							},
			setIfEmpty    : function (str) {
							  return esprima.parse(name + ".setIfEmpty(" + str + ")").body[0]
							}

		};
		return cstring;
	}


	module.CInt       = CInt;
	module.CString    = CString;
	module.CloudTypes = CloudTypes;

	return module;

}());