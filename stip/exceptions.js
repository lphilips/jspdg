var toreturn = {};

function NotImplementedError(message) {
    this.name = "NotImplementedError";
    this.message = (message || "");
    this.stack = (new Error()).stack;
}
NotImplementedError.prototype = Error.prototype;
toreturn.NotImplementedError = NotImplementedError;

function ReplyAnnotationLocation(message) {
    this.name = "ReplyAnnotationLocation";
    this.message = (message || "");
    this.stack = (new Error()).stack;
}
ReplyAnnotationLocation.prototype = Error.prototype;
toreturn.ReplyAnnotationLocation = ReplyAnnotationLocation;

function DeclarationNotFoundError(message) {
    this.name = "DeclarationNotFoundError";
    this.message = (message || "");
    this.stack = (new Error()).stack;
}
DeclarationNotFoundError.prototype = Error.prototype;
toreturn.DeclarationNotFoundError = DeclarationNotFoundError;

function MultipleFunctionsCalledError(message) {
    this.name = "MultipleFunctionsCalledError";
    this.message = (message || "");
    this.stack = (new Error()).stack;
}
MultipleFunctionsCalledError.prototype = Error.prototype;
toreturn.MultipleFunctionsCalledError = MultipleFunctionsCalledError;


function LocalUsedByOtherTier(message) {
    this.name = "LocalUsedByOtherTier";
    this.message = (message || "");
    this.stack = (new Error()).stack;
}
LocalUsedByOtherTier.prototype = Error.prototype;
toreturn.LocalUsedByOtherTier = LocalUsedByOtherTier;


function ObservableAssignmentOnOtherTier(message) {
    this.name = "ObservableAssignmentOnOtherTier";
    this.message = (message || "");
    this.stack = (new Error()).stack;
}

ObservableAssignmentOnOtherTier.prototype = Error.prototype;
toreturn.ObservableAssignmentOnOtherTier = ObservableAssignmentOnOtherTier;

module.exports = toreturn;
global.Exceptions = toreturn;