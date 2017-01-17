/***************/
/* Definitions */
/***************/

/**
 * Represents an HTML tag, together with the content.
 * @constructor
 * @param {String} tagname - The name of the tag.
 * @param {String} [id] - The id of the tag.
 * @param {Array} [classes] - Array containing the classes of the tag.
 * @param {Object} [attributes] - Object containing the attributes and values
 * of this tag.
 * @param {Array} [content] - The contents of this tag.
 * @private
 */
var Tag = function Tag(tagname, id, classes, attributes, content) {
	this.tagname = tagname;
	this.attributes = (attributes === undefined ? {} : attributes);
	this.id = (id === undefined ? false : id);
	this.classes = (classes === undefined ? [] : classes);
	this.content = (content === undefined ? [] : content);
	this.events = [];
};

/**
 * Represents a segment that is dynamically updated.
 * @constructor
 * @param {String} expression The raw, unparsed, expression
 */
var DynamicExpression = function DynamicExpression(expression) {
	this.expression = expression;
	this.crumb = null;
	this.isComment = false;
	this.isHiddenComment = false;
};

/**
 * Object keeping track of the contents of a dynamic if block.
 * @constructor
 * @param {String} predicateExpression The raw, unparsed, expression for the predicate
 */
var DynamicIfBlock = function DynamicIfBlock(predicateExpression) {
	this.type = "if";
	this.crumb = null;
	this.predicateExpression = predicateExpression;
	this.true_branch = [];
	this.false_branch = [];
};

/**
 * Object keeping track of the contents of a dynamic unless block.
 * @constructor
 * @param {String} predicateExpression The raw, unparsed, expression for the predicate
 */
var DynamicUnlessBlock = function DynamicUnlessBlock(predicateExpression) {
	this.type = "unless";
	this.crumb = null;
	this.predicateExpression = predicateExpression;
	this.true_branch = [];
};

/**
 * Object keeping track of the contents of a dynamic each block.
 * @constructor
 * @param {String} objectExpression The raw, unparsed, expression for the object
 */

var DynamicEachBlock = function DynamicEachBlock(objectExpression) {
	this.type = "each";
	this.crumb = null;
	this.objectExpression = objectExpression;
	this.body = [];
};

/**
 * Object keeping track of the contents of a dynamic with block.
 * @constructor
 * @param {String} objectExpression The raw, unparsed, expression for the object
 */

var DynamicWithBlock = function DynamicWithBlock(objectExpression) {
	this.type = "with";
	this.crumb = null;
	this.objectExpression = objectExpression;
	this.body = [];
};

/**
 * Object with options, and metadata of a conversion.
 * @constructor
 * @param {Object} options Object containing all the options, for possible
 * values and default values, see redstone-parser.js.
 */
var ConverterContext = function ConverterContext(options) {
	this.js = []; // List of generated Javascript
	this.callbacks = []; // List of callback names (as strings)
	this.crumbs = []; // List containing crumbs
	this.options = options; // Object containing options
	this.css = false; // Generated + supplied css
	this.idNames = []; // List of generated idNames, to make sure there are no duplicates
	this.varname2declNode = {}; // Mapping from variable names (as strings) to their declaration nodes
	this.stip = {}; // Information about Stip tool is temporary saved here
	this.functionNames = []; // Array containing function names that are being used in crumbs
	this.functionsInWith = [];
	this.exposedValues = [];
	this.clientJS = "";
	this.raw_source = "";
	this.has_server = true;
};

/**
 * Crumb object, containing information about what needs to be done when some variable changes value in the GUI.
 * @constructor
 * @param {String} idName The id of the crumb
 * @param {Array} variableNames Array containing the variable names
 * @param {Object} parsedExpression The parsed expression
 * @param {String|undefined} (defaultValue) The default value, before running client code
 */
var Crumb = function Crumb(idName, variableNames, parsedExpression, defaultValue) {
	this.idName = idName; // The randomly generated name of this crumb
	this.variableNames = (variableNames ? variableNames : []); // Array containing all the top-level variable names (for static analysis)
	this.parsedExpression = (parsedExpression ? parsedExpression : null); // Used while evaluating crumbs
	this.defaultValue = defaultValue; // Can be undefined
};

/**
 * An ExposedValue, which allows for two-way binding of the client interface
 * @param {String} expression The unparsed expression, showing where the exposed value should be stored
 * @constructor
 */
var ExposedValue = function ExposedValues(expression) {
	this.expression = expression;
	this.crumb = null;
	this.onChangeEvent = false;
};

/***********/
/* Exports */
/***********/

exports.Tag                = Tag;
exports.DynamicExpression  = DynamicExpression;
exports.ConverterContext   = ConverterContext;
exports.DynamicIfBlock     = DynamicIfBlock;
exports.DynamicUnlessBlock = DynamicUnlessBlock;
exports.DynamicEachBlock   = DynamicEachBlock;
exports.DynamicWithBlock   = DynamicWithBlock;
exports.Crumb              = Crumb;
exports.ExposedValue       = ExposedValue;