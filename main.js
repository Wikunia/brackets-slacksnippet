/*global define, brackets, $, Mustache, btoa */

define(function (require, exports, module) {
    "use strict";

    var dialogTemplate                   = require("text!templates/newSlackDialog.html"),
    	settingsTemplate                 = require("text!templates/settingsDialog.html");

    var CommandManager          = brackets.getModule("command/CommandManager"),
        DocumentManager         = brackets.getModule("document/DocumentManager"),
       	ProjectManager          = brackets.getModule("project/ProjectManager"),
        PreferencesManager      = brackets.getModule("preferences/PreferencesManager"),
        Dialogs                 = brackets.getModule("widgets/Dialogs"),
        EditorManager           = brackets.getModule("editor/EditorManager"),
        ExtensionUtils          = brackets.getModule("utils/ExtensionUtils"),
        Menus                   = brackets.getModule("command/Menus"),
        PanelManager            = brackets.getModule("view/PanelManager"),
		FileUtils 				= brackets.getModule("file/FileUtils"),
		FileSystem 				= brackets.getModule("filesystem/FileSystem"),
		KeyBindingManager 		= brackets.getModule('command/KeyBindingManager');

    var Strings                 = require("strings");

	var dialog;
    var $dialog                  = $();

	var settingsDialog;
    var $settingsDialog          = $();

    var PREFIX                  = "slack-manager",
		GM_PANEL                = PREFIX + ".panel",
        TOGGLE_PANEL            = PREFIX + ".run";

	var token = "", snippet, filetype;
	var settingsFile;
	var settingsChannel;
	var settingsToken;
	var storedSettings;

    /**
     * Push a snippet to slack
     */
    function snipIt() {
		$dialog.find("#snipit-error").css("display","none");
		if (token) {
			// save the channel for next time
			addSettings("local","token",$dialog.find("#slack-team").val());
			addSettings("local","channel",$dialog.find("#slack-channel").val());
			// save the settings
			var json = JSON.stringify(storedSettings);
			var write = FileUtils.writeText(settingsFile,json);
			write.fail(function(error) {
				alert("It was not possible to store your settings :(", error);
			});


		   $.post("https://slack.com/api/files.upload", {
				token: token,
				filetype: filetype,
				content: $dialog.find("#slack-content").val(),
				channels: $dialog.find("#slack-channel").val(),
			   	title: $dialog.find("#slack-title").val()
			}, function(data) {
				if (!data.ok) {
					// error
					$dialog.find("#snipit-error").html("Error: "+error);
		  			$dialog.find("#snipit-error").css("display","block");
				} else {
					dialog.close();
				}
			});

		}
    }

	/**
	 * Add a key value pair to the settings file (set scope to local to store the pair only for current path)
	 * @param {String} scope local or global (local => in basePath array)
	 * @param {string} key   key inside settings.type
	 * @param {string} value value of the settings.type.key
	 */
	function addSettings(scope,key,value) {
		if (scope == "local") {
			var basePath = ProjectManager.getProjectRoot()._path;
			if (!(basePath in storedSettings)) {
				storedSettings[basePath] = {};
			}
			storedSettings[basePath][key] = value;
		} else { // global
			storedSettings[key] = value;
		}
	}

	/**
	 * save the token inside the settings file
	 */
	function saveSettings() {
		$settingsDialog.find("#token-error").css("display","none");
		var tokens = [];
		// get all tokens
		$settingsDialog.find("#slack-token-list").children().each(function(index) {
			if ($(this).val() != "") { tokens.push($(this).val()); }
		});



		// testToken
		var test = testTokens(tokens);

		test.done(function(teams) {
				storedSettings 			= {};
				storedSettings.teams 	= [];
				for (var i = 0; i < tokens.length; i++) {
					storedSettings.teams.push({'token':tokens[i],'name':teams[i]});
				}
				var jsonSettings = JSON.stringify(storedSettings);
				var writeToken = FileUtils.writeText(settingsFile,jsonSettings);
				writeToken.fail(function(writeError) {
				   $settingsDialog.find("#token-error").html("Error: "+writeError);
				   $settingsDialog.find("#token-error").css("display","block");
				}).done(function() {
				   settingsDialog.close();
				   openPanel();
				});
		}).fail(function(error) {
			switch(error) {
				case "connection":
					$settingsDialog.find("#token-error").html("Error: Please check your internet connection");
					break;
				default:
					$settingsDialog.find("#token-error").html("Error: "+error);

			}
			$settingsDialog.find("#token-error").css("display","block");
		});

	}

	/**
	 * Check if every token is correct
	 * @param   {Array}    tokens all tokens
	 * @param   {Number}   index  [optional:0] check the tokens starting with this index
	 * @returns {Deferred} reject if at least one token is wrong else resolve true
	 */
	function testTokens(tokens,teams,index) {
		if (typeof index == "undefined") index = 0;
		if (typeof teams == "undefined") teams = [];
		var result = $.Deferred();
		if (tokens.length == 0) result.reject("empty token");
		// test the token with index index
		var test = testToken(tokens[index],index);
		test.done(function(response) {
			teams[index] = response.team;
			// check next token if there is another one
			if (tokens.length > index+1) {
				testTokens(tokens,teams,index+1)
				.done(function(teams) {
					result.resolve(teams);
				});
			} else {
 				result.resolve(teams);
			}
		})
		.fail(function(e) {
			result.reject(e);
		});
		return result.promise();
	}

	/**
	 * check if token is correct
	 * @returns {$.Deffered()} true or error code
	 */
	function testToken(token,index) {
		var result = $.Deferred();
		$.post("https://slack.com/api/auth.test", {
			token: token
		}, function(test) {
			if (test.ok) {
				result.resolve(test);
			} else {
				result.reject('Token Nr. '+parseInt(index+1)+' '+test.error);
			}
		})
		.fail(function() {
			result.reject("connection");
		});
		return result.promise();
	}

	/**
	 * open the send snippet panel
	 */
    function openPanel() {
		 dialog  = Dialogs.showModalDialogUsingTemplate(Mustache.render(dialogTemplate, Strings));
         $dialog = dialog.getElement();

		// get the current Project root and get the relative filename in the title
		var basePath = ProjectManager.getProjectRoot()._path;
		var relativeFilename = FileUtils.getRelativeFilename(basePath,DocumentManager.getCurrentDocument().file._path);
		if (!relativeFilename) {
			relativeFilename = DocumentManager.getCurrentDocument().file._name;
		}
		$dialog.find("#slack-title").val('Brackets Snippet <'+relativeFilename+'>');

		$dialog.find("#slack-content").val(snippet);

		// list all teams (saved in the settings file) #slack-team
		listTeams();
		changeChannels();

		$dialog
			.on("click", "#slack-change-token", function() {
				dialog.close();
				openSettings();
			})
			.on("change", "#slack-team", function() {
				token = $dialog.find("#slack-team").val();
				// update the channels list!
				changeChannels();
			});
    }

	/**
	 * A user can have more than one Slack acccount so it must be possible to add another token
	 */
	function addTokenInput() {
		$settingsDialog.find("#slack-token-list").append(
			Mustache.render('<input type="text" name="description" placeholder="{{SLACK_TOKEN_HERE}}">', Strings)
		);
	}

	/**
	 * open the settings panel
	 */
	function openSettings() {
		saveSnippet();
		// create slacksnippet.json
		createSettingsFile();

		settingsDialog  = Dialogs.showModalDialogUsingTemplate(Mustache.render(settingsTemplate, Strings));
        $settingsDialog = settingsDialog.getElement();
		// fill all tokens
		var index = 0;
		if (storedSettings && "teams" in storedSettings) {
			$.each(storedSettings.teams, function(index,team) {
				$settingsDialog.find("#slack-token-list").children("input:eq("+index+")").val(team.token);
				$settingsDialog.find("#slack-token-list").children("input:eq("+index+")").attr("title",team.name);
				addTokenInput();
				index++;
			});
		}

        // Add events handler to slack Manager panel
        $settingsDialog
            .on("click", "#slack-save", function() {
                saveSettings();
           });
		$settingsDialog
            .on("click", "#slack-addToken", function() {
                addTokenInput();
           });
	}

	function listTeams() {
		var select = $dialog.find('#slack-team');
		$('option', select).remove();


		$.each(storedSettings.teams, function(index,team) {
			if (token == "") { token = team.token; }
			var option = new Option(team.name, team.token);
			// last used token for this path should be the first token
			if (team.token == settingsToken) {
				token = team.token;
				select.prepend($(option));
			} else {
				select.append($(option));
			}
		});
	}

	function changeChannels() {
		$dialog.off("click", "#slack-snipit");

		var channelsDef = listChannels();
        // Add events handler to slack Manager panel
		channelsDef.done(function() {
			$dialog
				.on("click", "#slack-snipit", function() {
					snipIt();
				})
		})
		.fail(function(error) {
			$dialog.find("#snipit-error").css("display","none");
			switch(error) {
				case "connection":
					$dialog.find("#snipit-error").html("Error: Please check your internet connection");
					break;
				default:
					$dialog.find("#snipit-error").html("Error: "+error);

			}
			$dialog.find("#snipit-error").css("display","block");
		});
	}

	/**
	 * add channels to #slack-channel
	 * if a channel was used before for the current basePath => first
	 * @returns {$.Deferred()} true or error code
	 */
	function listChannels() {
		var result = $.Deferred();
		if (token != "") {
			var select = $dialog.find('#slack-channel');
			$('option', select).remove();

			$.post("https://slack.com/api/channels.list", {
				token: token
			}, function(channels) {
				if (channels.ok) {
					$.each(channels.channels, function(key, channel) {
						var option = new Option('#'+channel.name, channel.id);
						// settingsChannel is the channel that was used the last time for this basePath
						if (channel.id == settingsChannel) {
							select.prepend($(option));
						} else {
							select.append($(option));
						}
					});
					result.resolve(true);
				} else {
					result.reject(channels.error);
				}
			}).fail(function() {
				result.reject("connection");
			});
		}
		return result.promise();
	}

	/**
	 * save the current selection and the filetype (snippet & filetype)
	 */
	function saveSnippet() {
		var editor = EditorManager.getFocusedEditor();
		if (editor) {
			snippet = editor.getSelectedText();
			filetype = editor.getModeForSelection();
		}
	}

	/**
	 * handle the shortcut Alt+M
	 * - create the settings file
	 * - save the snippet
	 * - openPanel or openSettings
	 */
	function handleSnippet() {
		// create slacksnippet.json
		createSettingsFile();
		saveSnippet();

		// check if token exists else show settings
		var savedToken = FileUtils.readAsText(settingsFile);
		savedToken.done(function(settings) {
			if (settings != "") {
				settings = JSON.parse(settings);
				if ("token" in settings) {
					// old version
					var tokens = [settings.token];
					var test = testTokens([settings.token]);

					test.done(function(teams) {
							settings = {};
							settings.teams = [];
							settings.teams.push({'token':tokens[0],'name':teams[0]});
							storedSettings = settings;
							settings = JSON.stringify(settings);
							var writeToken = FileUtils.writeText(settingsFile,settings);
							openPanel();
					}).fail(function() {
						openSettings();
					});
				} else {
					storedSettings = settings;
					var basePath = ProjectManager.getProjectRoot()._path;
					if (basePath in settings) {
						settingsToken   = settings[basePath].token;
						settingsChannel = settings[basePath].channel;
					}
					openPanel();
				}
			} else {
				openSettings();
			}
		}).fail(function(error) {
			if (error == "NotFound") {
				openSettings();
			}
		});
	}

	/**
	 * Create the settingsFile and create a directory Slack in the documents folder
	 */
	function createSettingsFile() {
		var dir = brackets.app.getUserDocumentsDirectory()+'/Slack/';
			settingsFile = dir+'slacksnippet.json';
			dir = FileSystem.getDirectoryForPath(dir);
			dir.create();
			settingsFile = FileSystem.getFileForPath(settingsFile);
	}

	function init() {
		 // Load compiled CSS of slack Manager
        ExtensionUtils.loadStyleSheet(module, "styles/slack-manager.css");
	}

	init();

	 // First, register a command - a UI-less object associating an id to a handler
    var MY_COMMAND_ID = "slacksnippet.handle";   // package-style naming to avoid collisions
    CommandManager.register("Slack Snippet", MY_COMMAND_ID, handleSnippet);
	$("<a href='#' id='Toolbar-SlackSnippet' title='Snip it!'></a>").appendTo("#main-toolbar div.buttons").on("click", handleSnippet);

    KeyBindingManager.addBinding(MY_COMMAND_ID, "Alt-S");


});
