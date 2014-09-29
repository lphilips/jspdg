var jslint = function() {
	var code = "/*global print, read, broadcast, publish, installL*/\n" +
				editor.getSession().getValue();
	JSLINT(code);
	var data = JSLINT.data(),
	    errtext = JSLINT.error_report(data),
	    funtext =  JSLINT.report(data),
        protext = JSLINT.properties_report(JSLINT.property),
		errors = document.getElementById("jslinterrors"),
		functions = document.getElementById("jslintfunction"),
		properties = document.getElementById("jslintproperties");
	errors.innerHTML = errtext;
	functions.innerHTML = funtext;
	properties.innerHTML = protext;
}