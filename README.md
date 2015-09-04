### Stip.js - Slicing tierless projects in JavaScript

#### First prototype

This project contains the code of the Stip.js project, a tool for splitting tierless JavaScript programs.
At the moment this is a very early prototype, meaning that we only support a small subset of JavaScript. 
To show that the tierless code is pure JavaScript, we added tabs for other JavaScript tools to analyse the code.
The tool can also be used to slice JavaScript code or perform CPS transformations on it.
Try it out [here](http://bit.ly/stipjs)!

#### Jipda

STiP.js makes use of [Jipda](https://github.com/jensnicolay/jipda), a JavaScript Introspective Pushdown Analysis. 
Based on this analysis, we construct a distributed program dependency graph. 
The output of this analysis can be inspected via the Jipda tab.

#### Tier Splitting

At the moment we rewrite the splitted code to [Meteor](http://www.meteor.com/) or Node.js code. 
For Node.js we use the [asyncCall](https://github.com/dielc/asyncCall.js) library for remote communication. 
This library has a high configurability and a variety of failure handling mechanisms. 
For Meteor, we use the framework for remote communication between clients and servers ([more info](http://docs.meteor.com/#/full/meteor_methods)). 
Client and server side code can be pasted in files in the appropriate directories (client or server) of a Meteor project.

#### Publications

* **Towards Tierless Web Development without Tierless Languages**. Philips, Laure; De Roover, Coen; Van Cutsem, Tom; De Meuter, Wolfgang. Onward! '14. ACM, 2014. (Proceedings of the ACM International Symposium on New Ideas, New Paradigms, and Reflections on Programming and Software Proceedings). [link](http://soft.vub.ac.be/Publications/2014/vub-soft-tr-14-15.pdf)
* **Tierless Programming in JavaScript**. Philips, Laure; De Meuter, Wolfgang; De Roover, Coen. 37th International Conference on Software Engineering (ICSE 2015). IEEE, 2015. p. 831-832. [link](http://soft.vub.ac.be/Publications/2015/vub-soft-tr-15-03.pdf)

#### Working on...

We plan to

* Support a bigger subset of JavaScript
* Horizontal distribution
* Rewrite to other frameworks
*  ...

#### Contact

In case of questions, suggestions, etc. : *lphilips at vub.ac.be*
