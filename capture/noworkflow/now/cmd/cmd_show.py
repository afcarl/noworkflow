# Copyright (c) 2014 Universidade Federal Fluminense (UFF), Polytechnic Institute of New York University.
# This file is part of noWorkflow. Please, consult the license terms in the LICENSE file.

from __future__ import absolute_import
from __future__ import print_function

import os
import sys

from .. import persistence
from .. import utils
from .command import Command

class Show(Command):

    def add_arguments(self):
        p = self.parser
        p.add_argument('trial', type=int, nargs='?', help='trial id or none for last trial')
        p.add_argument('-m', '--modules', help='shows module dependencies', action='store_true')
        p.add_argument('-d', '--function-defs', help='shows the user-defined functions', action='store_true')
        p.add_argument('-e', '--environment', help='shows the environment conditions', action='store_true')
        p.add_argument('-a', '--function-activations', help='shows function activations', action='store_true')
        p.add_argument('-f', '--file-accesses', help='shows read/write access to files', action='store_true')

    def execute(self, args):
        persistence.connect_existing(os.getcwd())
        last_trial_id = persistence.last_trial_id()
        trial_id = args.trial if args.trial != None else last_trial_id
        if not 1 <= trial_id <= last_trial_id:
            utils.print_msg('inexistent trial id', True)
            sys.exit(1)
        self.print_trial(persistence.load_trial(trial_id).fetchone())

        if args.modules:
            self.print_modules(persistence.load_dependencies())
        
        if args.function_defs:
            self.print_function_defs(persistence.load('function_def', trial_id = trial_id))

        if args.environment:
            environment = {attr['name']: attr['value'] for attr in persistence.load('environment_attr', trial_id = trial_id)}
            utils.print_map('this trial has been executed under the following environment conditions', environment)

        if args.function_activations:
            self.print_function_activations(persistence.load('function_activation', caller_id = None, trial_id = trial_id).fetchone())
      
        if args.file_accesses:
            self.print_file_accesses(persistence.load('file_access', trial_id = trial_id))

    def print_trial(self, trial):
        utils.print_msg('trial information:', True)
        print('  Id: {id}\n  Inherited Id: {inherited_id}\n  Script: {script}\n  Code hash: {code_hash}\n  Start: {start}\n  Finish: {finish}'.format(**trial))

    def print_modules(self, modules):
        utils.print_msg('this trial depends on the following modules:', True)
        output = []
        for module in modules:
            output.append('  Name: {name}\n  Version: {version}\n  Path: {path}\n  Code hash: {code_hash}'.format(**module))
        print('\n\n'.join(output))

    def print_function_defs(self, function_defs):
        utils.print_msg('this trial has the following functions:', True)
        output = []
        for function_def in function_defs:
            objects = {'GLOBAL':[], 'ARGUMENT':[], 'FUNCTION_CALL':[]}
            for obj in persistence.load('object', function_def_id = function_def['id']):
                objects[obj['type']].append(obj['name'])
            output.append('  Name: {name}\n  Arguments: {arguments}\n  Globals: {globals}\n  Function calls: {calls}\n  Code hash: {code_hash}'.format(arguments = ', '.join(objects['ARGUMENT']), globals = ', '.join(objects['GLOBAL']), calls = ', '.join(objects['FUNCTION_CALL']), **function_def))
        print('\n\n'.join(output))

    def print_function_activation(self, function_activation, level = 1):
        object_values = {'GLOBAL':[], 'ARGUMENT':[]}
        for obj in persistence.load('object_value', function_activation_id = function_activation['id']):
            object_values[obj['type']].append('{} = {}'.format(obj['name'], obj['value']))
        text = '{indent}{line}: {name} ({start} - {finish})'.format(indent = '  ' * level, **function_activation)
        indent = text.index(': ') + 2
        print(text)
        if object_values['ARGUMENT']:
            print('{indent}Arguments: {arguments}'.format(indent = ' ' * indent, arguments = ', '.join(object_values['ARGUMENT'])))
        if object_values['GLOBAL']:
            print('{indent}Globals: {globals}'.format(indent = ' ' * indent, globals = ', '.join(object_values['GLOBAL'])))
        if function_activation['return']:
            print('{indent}Return value: {ret}'.format(indent = ' ' * indent, ret = function_activation['return']))

        for inner_function_activation in persistence.load('function_activation', caller_id = function_activation['id']):
            self.print_function_activation(inner_function_activation, level + 1)    

    def print_function_activations(self, function_activation):
        utils.print_msg('this trial has the following function activation graph:', True)
        
        for inner_function_activation in persistence.load('function_activation', caller_id = function_activation['id']):
            self.print_function_activation(inner_function_activation)

    def print_file_accesses(self, file_accesses):
        utils.print_msg('this trial accessed the following files:', True)
        output = []
        for file_access in file_accesses:
            stack = []
            function_activation = persistence.load('function_activation', id = file_access['function_activation_id']).fetchone()
            while function_activation:
                function_name = function_activation['name']
                function_activation = persistence.load('function_activation', id = function_activation['caller_id']).fetchone()
                if function_activation:
                    stack.insert(0, function_name)
            if not stack or stack[-1] != 'open':
                stack.append(' ... -> open')
            
            output.append('  Name: {name}\n  Mode: {mode}\n  Buffering: {buffering}\n  Content hash before: {content_hash_before}\n  Content hash after: {content_hash_after}\n  Timestamp: {timestamp}\n  Function: {stack}'.format(stack = ' -> '.join(stack), **file_access))
        print('\n\n'.join(output))