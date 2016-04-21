function NotImplementedError(message) {
    this.name = "NotImplementedError";
    this.message = (message || "");
    this.stack = (new Error()).stack;
}
NotImplementedError.prototype = Error.prototype;


function DeclarationNotFoundError(message) {
    this.name = "DeclarationNotFoundError";
    this.message = (message || "");
    this.stack = (new Error()).stack;
}
DeclarationNotFoundError.prototype = Error.prototype;

function MultipleFunctionsCalledError(message) {
    this.name = "MultipleFunctionsCalledError";
    this.message = (message || "");
    this.stack = (new Error()).stack;
}
MultipleFunctionsCalledError.prototype = Error.prototype;