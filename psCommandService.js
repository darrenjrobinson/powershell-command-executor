module.exports = PSCommandService;

var Promise = require('promise');
var Mustache = require('mustache');

function PSCommandService(statefulProcessCommandProxy, commandRegistry) {
    this._statefulProcessCommandProxy = statefulProcessCommandProxy;

    this._commandRegistry = commandRegistry;

    {


        /*******************************
        *
        * Command registry
        *
        * argument properties (optional):
        *    - quoted: true|false, default true
        *    - valued: true|false, default true
        *    - default: optional default value (only if valued..)
        *
        ********************************/

        'getDistributionGroup': {
            'command': 'Get-DistributionGroup {{{arguments}}} | ConvertTo-Json',
            'arguments': {
                'Identity': {}
            }
        },

        'createDistributionGroup': {

            'command': 'New-DistributionGroup -Confirm:$False {{{arguments}}} | ConvertTo-Json',

            'arguments': {
                'Name':               {},
                'DisplayName':        {},
                'Alias':              {},
                'PrimarySmtpAddress': {},
                'ManagedBy':          {},
                'Members':            {},
                'Type':               { 'default':'Security'},
                'ModerationEnabled':              { 'default':'$false', 'quoted':false},
                'MemberDepartRestriction':        { 'default':'Closed'},
                'MemberJoinRestriction':          { 'default':'Closed'},
                'SendModerationNotifications':    { 'default':'Never', 'quoted':false},

            }
        },

        'updateDistributionGroup': {

            'command': 'Set-DistributionGroup -Confirm:$False {{{arguments}}}',

            'arguments': {
                'Identity':           {},
                'Name':               {},
                'DisplayName':        {},
                'Alias':              {},
                'PrimarySmtpAddress': {},
                'ManagedBy':          {},
                'Members':            {},
                'Type':               { 'default':'Security'},
                'ModerationEnabled':              { 'default':'$false', 'quoted':false},
                'MemberDepartRestriction':        { 'default':'Closed'},
                'MemberJoinRestriction':          { 'default':'Closed'},
                'SendModerationNotifications':    { 'default':'Never', 'quoted':false}
            }
        },


        'deleteDistributionGroup': {

            'command': 'Remove-DistributionGroup {{{arguments}}} -Confirm:$false',

            'arguments': {
                'Identity':           {}
            }
        },


        'getDistributionGroupMember': {

            'command': 'Get-DistributionGroupMember {{{arguments}}} | ConvertTo-Json',

            'arguments': {
                'Identity':           {}
            }
        },


        'addDistributionGroupMember': {

            'command': 'Add-DistributionGroupMember {{{arguments}}}',

            'arguments': {
                'Identity':           {},
                'Member':             {}
            }
        },

        // members specified w/ this are a full overwrite..
        'updateDistributionGroupMembers': {

            'command': 'Update-DistributionGroupMember -Confirm:$false {{{arguments}}}',

            'arguments': {
                'Identity':           {},
                'Members':            {}
            }
        },

        // members specified w/ this are a full overwrite..
        'removeDistributionGroupMember': {

            'command': 'Remove-DistributionGroupMember {{{arguments}}} -Confirm:$false',

            'arguments': {
                'Identity':          {},
                'Member':            {}
            }
        },




    };
}

/**
* executeForStdout()
*
* Executes a named powershell command as registered in the
* command registry, applying the values from the argument map
* returns a promise that when fulfilled returns the stdout
* from the command.
*
* On reject an error message
*
* @param array of commands
*/
PSCommandService.prototype.executeForStdout = function(commandName, argument2ValueMap) {
    var commandConfig = this._commandRegistry[commandName];
    var command = this._generateCommand(commandConfig, argument2ValueMap);
    return this._executeForStdout(command);
}


/**
* _executeForStdout()
*
* Executes one powershell command generated by _generateCommand(),
* returns a promise when fulfilled returns the stdout from the command
*
*
* On reject an error message
*
* @param array of commands
*/
PSCommandService.prototype._executeForStdout = function(command) {
    var self = this;

    return new Promise(function(fulfill,reject) {
        self.executeCommands([command])
        .then(function(cmdResults) {
            fulfill(cmdResults[command].stdout);
        }).catch(function(error) {
            reject('unexpected error getting executing command: ' + error + "\n" + error.stack);
        });
    });
}

/**
* _executeCommands()
*
* Executes one or more powershell commands generated by _generateCommand(),
* returns a promise when fulfilled returns an hash of results in the form:

* { <command> : {command: <command>, stdout: value, stderr: value }}
*
* On reject an error message
*
* @param array of commands
*/
PSCommandService.prototype._executeCommands = function(commands) {
    var self = this;

    return new Promise(function(fulfill,reject) {
        self._statefulProcessCommandProxy.executeCommands(commands)
        .then(function(cmdResults) {
            fulfill(cmdResults);
        }).catch(function(error) {
            reject('unexpected error getting executing commands: ' + error + "\n" + error.stack);
        });
    });
}

/**
* _generateCommand()
*
* @param commandConfig a command config object that the argumentMap will be applied to
* @param argument2ValueMap map of argument names -> values (valid for the passed commandConfig)
*
* @return a formatted powershell command string suitable for execution
*
*/
PSCommandService.prototype._generateCommand = function(commandConfig, argument2ValueMap) {

    var argumentsConfig = commandConfig.arguments;

    var argumentsString = "";

    for (var argumentName in argumentsConfig) {

        if(argumentsConfig.hasOwnProperty(argumentName)) {

            var argument = argumentsConfig[argumentName];

            // is argument valued
            if ((argument.hasOwnProperty('valued') ? argument.valued : true)) {

                var isQuoted = (argument.hasOwnProperty('quoted') ? argument.quoted : true);
                var passedArgValues = argument2ValueMap[argumentName];

                if (!(passedArgValues instanceof Array)) {

                    if (typeof passedArgValues === 'undefined') {

                        if (argument.hasOwnProperty('default')) {
                            passedArgValues = [argument.default];
                        } else {
                            passedArgValues = [];
                        }

                    } else {
                        passedArgValues = [passedArgValues];
                    }
                }

                var argumentValues = "";
                for (var i=0; i<passedArgValues.length; i++) {

                    var passedArgValue = passedArgValues[i];

                    var valueToSet;

                    if (passedArgValue && passedArgValue != 'undefined') {
                        valueToSet = passedArgValue;

                    } else if (argument.hasOwnProperty('default')) {
                        valueToSet = argument.default;
                    }

                    // append the value
                    if (valueToSet && valueToSet.trim().length > 0) {
                        argumentValues += ((isQuoted?'"':'')+valueToSet+(isQuoted?'"':'')+",");
                    }
                }

                // were values appended?
                if (argumentValues.length > 0) {

                    // append to arg string
                    argumentsString += (("-"+argumentName+" ") + argumentValues);

                    if (argumentsString.lastIndexOf(',') == (argumentsString.length -1)) {
                        argumentsString = argumentsString.substring(0,argumentsString.length-1);
                    }
                    argumentsString += " ";
                }

                // argument is NOT valued, just append the name
            } else {
                argumentsString += ("-"+argumentName+" ");
            }

        }

    }

    return Mustache.render(commandConfig.command,{'arguments':argumentsString});
}
