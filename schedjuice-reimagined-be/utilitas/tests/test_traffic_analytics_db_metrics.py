import time
from django.db import connection
from django.test import TestCase

from utilitas.traffic_analytics.db_metrics import DbMetricsCollector


class DbMetricsCollectorTests(TestCase):
    databases = {"default"}

    def test_counts_queries_and_accumulates_time(self):
        collector = DbMetricsCollector()
        with collector.wrap():
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.execute("SELECT 2")
        self.assertEqual(collector.query_count, 2)
        self.assertGreater(collector.query_time_ms, 0.0)
