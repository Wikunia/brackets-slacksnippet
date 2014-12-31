/*
 * Copyright (c) 2012 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4,
maxerr: 50, node: true */
/*global */

(function () {
    "use strict";
    
    var os = require("os");
	var fs = require('fs');
	var https = require('https');
        
	function downloadFile(urlFile,file,returnB,callback) {	
		console.log('download file: '+urlFile);
		console.log('return: ',returnB);
		console.log('file: ',file);
		
		
		if (file) {
			file = fs.createWriteStream(file);
		}
		
		https.get(urlFile, function(response) {		
			if (file) {
				response.pipe(file);
			}
			if (returnB) {
				var body = '';
				response.on('data', function(chunk) {
					body += chunk;
				});
				response.on('end', function() {
					callback(null,body);
				});
			} else {
				callback(null,'');
			}
		}).on('error', function(e) {
			callback(e.message);
		});	
    }	
    
    /**
     * Initializes the test domain with several test commands.
     * @param {DomainManager} domainManager The DomainManager for the server
     */
    function init(domainManager) {
        if (!domainManager.hasDomain("slacksnippet")) {
            domainManager.registerDomain("slacksnippet", {major: 0, minor: 1});
        }
        domainManager.registerCommand(
            "slacksnippet",     // domain name
            "downloadFile",   	// command name
            downloadFile,   	// command handler function
            true	        // this command is asynchronous in Node
        );
    }
    
    exports.init = init;
    
}());
