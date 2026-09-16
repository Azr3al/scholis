from django.contrib import admin

from app_quiz_v3 import models

admin.site.register(models.QuizCategory)
admin.site.register(models.Quiz)
admin.site.register(models.Question)
admin.site.register(models.QuestionOption)
admin.site.register(models.QuizAttempt)
admin.site.register(models.AttemptAnswer)
