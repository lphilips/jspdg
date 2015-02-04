/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * **
 * 			CLOUD TYPES TRANSFORMATIONS																			*
 *																												*	
 *     Based on JavaScript implementation : https://github.com/ticup/CloudTypes 								*
 *																												*
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * **/


 var CTTransform = (function () {

 	var module        = {},
 		CTtoTransform = {
 			CInt    : transformCInt,
 			CString : transformCString
 		};


 	/* Analysis functions to decide whether a var decl has the same type throughout the whole program */

 	var getJipdaType = function (konts) {
 		konts.map(function (kont) {

 		})
 	}


 	var transformVarDecl = function (vardecl, type) {
 		var transformF = CTtoTransform[type];
 		return transformF(vardecl)
 	}

 	var transformCInt = function (vardecl) {
 		var cint = CTParse.CInt(vardecl.name);
 		return cint;
 	}

 	var transformCString = function (vardecl) {
 		var cstring = CTParse.CString(vardecl.name);
 		return cstring;
 	}


 	module.transformVarDecl = transformVarDecl;
 	
 	return module;

 })()