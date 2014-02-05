/*
 * Works on the level of esprima nodes
 */

// Client
var client_annotation = "@client"
var server_annotation = "@server"


// Client annotations is @client in comment
var isClientAnnotated = function(node) {
  return node.leadingComment && node.leadingComment.value.indexOf(client_annotation) != -1;
}

// Server annotations is @server in comment
var isServerAnnotated = function(node) {
  return node.leadingComment && node.leadingComment.value.indexOf(server_annotation) != -1;
}