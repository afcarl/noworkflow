# Copyright (c) 2016 Universidade Federal Fluminense (UFF)
# Copyright (c) 2016 Polytechnic Institute of New York University.
# This file is part of noWorkflow.
# Please, consult the license terms in the LICENSE file.
"""History Model"""
from __future__ import (absolute_import, print_function,
                        division, unicode_literals)

import json

from collections import defaultdict,  deque
from itertools import groupby

from sqlalchemy import distinct

from ..graphs.history_graph import HistoryGraph
from ..persistence import row_to_dict
from ..persistence import persistence
from ..cross_version import keys, values, items
from .model import Model
from .trial import Trial


class History(Model):
    """This model represents the workflow evolution history

    It is possible to filter the evolution history by selecting the script:
        history.script = "script1.py"

    The set of scripts can be accessed by:
        history.scripts

    It is also possible to filter the evolution history by selecting the
    trial status:
        history.status = "finished"

    The list of status are:
        finished: show only finished trials
        unfinished: show only unfinished trials
        backup: show only backup trials

    The default option for both filters is "*", which means that all trials
    appear in the history
        history.script = "*"
        history.status = "*"

    You can change the graph width and height by the variables:
        history.graph.width = 600
        history.graph.height = 200
    """

    DEFAULT = {
        'graph.width': 700,
        'graph.height': 300,
        'graph.use_cache': True,
        'script': '*',
        'status': '*',
    }

    REPLACE = {
        'graph_width': 'graph.width',
        'graph_height': 'graph.height',
        'graph_use_cache': 'graph.use_cache',
    }

    def __init__(self, **kwargs):
        super(History, self).__init__(**kwargs)
        self.script = "*"
        self.status = "*"
        self.graph = HistoryGraph(self)
        self.initialize_default(kwargs)
        self.status_options = ["*", "finished", "unfinished", "backup"]

    @property
    def scripts(self):
        """Return a set of scripts used for trials"""
        return {s[0].rsplit('/', 1)[-1]
                for s in persistence.session.query(distinct(Trial.script))}

    @property
    def trials(self):
        """Return a SQLAlchemy query of trials"""
        return persistence.session.query(Trial)

    def _repr_html_(self):
        """Display d3 graph on ipython notebook"""
        return self.graph._repr_html_()

    def __repr__(self):
        return repr(self.graph)
