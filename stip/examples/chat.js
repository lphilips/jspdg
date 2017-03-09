/* @server */
{
	/* @replicated */
	var messages = [];
}

/* @client */
{
	var name = "user" + (Math.floor(Math.random() * 9901) + 100);
	var msg  = "";

	function chat() {
		messages.push({name: name, message: msg});
		msg = "";
	}
}

/* @ui */
{{#each messages}}
	p {{name + " says: " + message}}

input[value={{name}}]
input[value={{msg}}][placeholder=Message]
button[@click=chat]#send Send