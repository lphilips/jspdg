
var toCode = function(option, slicednodes,node) {
	switch (option) {
		case "normal":
			return toJavaScript(slicednodes,node)
		case "meteor":
			return meteorify(slicednodes,node)
	}
}