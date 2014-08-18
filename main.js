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

	var token, snippet, filetype;
	var file;
	var settingsChannel;

    /**
     * Push a snippet to slack
     */
    function snipIt() {
		$dialog.find("#snipit-error").css("display","none");
		if (token) {
		   // save the channel for next time
		   addSettings("channels",ProjectManager.getProjectRoot()._path,$dialog.find("#slack-channel").val());

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
	 * Add a key value pair to the setting inside type key
	 * @param {string} type settings key
	 * @param {string} key key inside settings.type
	 * @param {string} value value of the settings.type.key
	 */
	function addSettings(type,key,value) {
		var settingsRead = FileUtils.readAsText(file);
		settingsRead.done(function(settings) {
			if (settings != "") {
				settings = JSON.parse(settings);
				if (!(type in settings)) {
					settings[type] = {};
				}
				settings[type][key] = value;
				var json = JSON.stringify(settings);
				FileUtils.writeText(file,json);
			}
		});

	}

	/**
	 * save the token inside the settings file
	 */
	function saveToken() {
		$settingsDialog.find("#token-error").css("display","none");
		// testToken
		var test = errorToken();

		test.done(function() {
		   var jsonToken = '{"token":"'+token+'"}';
		   var writeToken = FileUtils.writeText(file,jsonToken);
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
	 * check if token is correct
	 * @returns {$.Deffered()} true or error code
	 */
	function errorToken() {
		var result = $.Deferred();
		$.post("https://slack.com/api/auth.test", {
			token: token
		}, function(test) {
			if (test.ok) {
				result.resolve(true);
			} else {
				result.reject(test.error);
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

		var channelsDef = addChannels();
        // Add events handler to slack Manager panel
		channelsDef.done(function() {
			$dialog
				.on("click", "#slack-snipit", function() {
					snipIt();
				})
				.on("click", "#slack-change-token", function() {
					dialog.close();
					openSettings();
				});
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
	 * open the settings panel
	 */
	function openSettings() {
		saveSnippet();
		// create slacksnippet.json
		createSettingsFile();

		settingsDialog  = Dialogs.showModalDialogUsingTemplate(Mustache.render(settingsTemplate, Strings));
        $settingsDialog = settingsDialog.getElement();

        // Add events handler to slack Manager panel
         $settingsDialog
            .on("click", "#slack-save", function() {
				token = $settingsDialog.find("#slack-token").val();
                saveToken();
            });
	}

	/**
	 * add channels to #slack-channel
	 * if a channel was used before for the current basePath => first
	 * @returns {$.Deferred()} true or error code
	 */
	function addChannels() {
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
		var savedToken = FileUtils.readAsText(file);
		savedToken.done(function(settings) {
			if (settings != "") {
				settings = JSON.parse(settings);
				token = settings.token;
				if ("channels" in settings) {
					var basePath = ProjectManager.getProjectRoot()._path;
					if (basePath in settings.channels) {
						settingsChannel = settings.channels[basePath];
					}
				}
				openPanel();
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
	 * Create the settingsFile and creat a directory Slack in the documents folder
	 */
	function createSettingsFile() {
		var dir = brackets.app.getUserDocumentsDirectory()+'/Slack/';
			file = dir+'slacksnippet.json';
			dir = FileSystem.getDirectoryForPath(dir);
			dir.create();
			file = FileSystem.getFileForPath(file);
	}

	function init() {
		 // Load compiled CSS of slack Manager
        ExtensionUtils.loadStyleSheet(module, "styles/slack-manager.css");
	}

	init();

	 // First, register a command - a UI-less object associating an id to a handler
    var MY_COMMAND_ID = "slacksnippet.handle";   // package-style naming to avoid collisions
    CommandManager.register("Slack Snippet", MY_COMMAND_ID, handleSnippet);

    // We could also add a key binding at the same time:
    KeyBindingManager.addBinding(MY_COMMAND_ID, "Alt-S");
    // (Note: "Ctrl" is automatically mapped to "Cmd" on Mac)

});
