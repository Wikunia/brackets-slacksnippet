/*global define, brackets, $, Mustache, btoa */

define(function (require, exports, module) {
    "use strict";

    var dialogTemplate                   = require("text!templates/newSlackDialog.html"),
    	settingsTemplate                 = require("text!templates/settingsDialog.html");

    var CommandManager          = brackets.getModule("command/CommandManager"),
        DocumentManager         = brackets.getModule("document/DocumentManager"),
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

    // Post a new slack
    function snipIt() {
		$dialog.find("#snipit-error").css("display","none");
		if (token) {
		   $.post("https://slack.com/api/files.upload", {
				token: token,
				filetype: filetype,
				content: $dialog.find("#slack-content").val(),
				channels: $dialog.find("#slack-channel").val(),
			   	title: $dialog.find("#slack-title").val()
			}, function(data) {
				if (!data.ok) {
					console.log(data);
					// error
					$dialog.find("#snipit-error").html("Error: "+error);
		  			$dialog.find("#snipit-error").css("display","block");
				} else {
					dialog.close();
				}
			});

		}
    }

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
			$settingsDialog.find("#token-error").html("Error: "+error);
			$settingsDialog.find("#token-error").css("display","block");
		});
	}

	function errorToken() {
		var result = $.Deferred();
		$.post("https://slack.com/api/auth.test", {
			token: token
		}, function(test) {
			if (test.ok) {
				result.resolve(true);
			} else {
				console.log(test);
				result.reject(test.error);
			}
		});
		return result;
	}

    function openPanel() {
		console.log('openPanel');

		 dialog  = Dialogs.showModalDialogUsingTemplate(Mustache.render(dialogTemplate, Strings));
         $dialog = dialog.getElement();


		$dialog.find("#slack-title").val('Brackets Snippet <'+DocumentManager.getCurrentDocument().file._name+'>');
		$dialog.find("#slack-content").val(snippet);

		addChannelsAndDMs();
        // Add events handler to slack Manager panel
        $dialog
            .on("click", "#slack-snipit", function() {
                snipIt();
            })
			.on("click", "#slack-change-token", function() {
				dialog.close();
				openSettings();
			});
    }

	function openSettings() {
		saveSnippet();
		// create slacksnippet.json
		createSettingsFile();

		console.log('openSettings');

		 settingsDialog  = Dialogs.showModalDialogUsingTemplate(Mustache.render(settingsTemplate, Strings));
         $settingsDialog = settingsDialog.getElement();



		console.log( $settingsDialog);
        // Add events handler to slack Manager panel
         $settingsDialog
            .on("click", "#slack-save", function() {
				token = $settingsDialog.find("#slack-token").val();
                saveToken();
            });
	}

	function addChannelsAndDMs() {
		if (token != "") {
			console.log(token);
			console.log(token.length);
			var select = $dialog.find('#slack-channel');
			console.log($dialog);
			console.log(select);
			$('option', select).remove();

			$.post("https://slack.com/api/channels.list", {
					token: token
			}, function(channels) {
				console.log(channels);
				if (channels.ok) {
					$.each(channels.channels, function(key, channel) {
						var option = new Option('#'+channel.name, channel.id);
						select.append($(option));
					});
				}
			});
		}
	}


	function saveSnippet() {
		var editor = EditorManager.getFocusedEditor();
		if (editor) {
			snippet = editor.getSelectedText();
			filetype = editor.getModeForSelection();
		}
	}

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
				openPanel();
			} else {
				openSettings();
			}
		}).fail(function(error) {
			if (error == "NotFound") {
				openSettings();
			}
			console.log(error);
		});
	}

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
