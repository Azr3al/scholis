from django.db import models
from utilitas.models import BaseModel


class Genre(BaseModel):
    name = models.CharField(max_length=1024)

    def __str__(self):
        return self.name


class Book(BaseModel):
    class RecommendedLevel(models.TextChoices):
        EARLY_READER = "early_reader", "early_reader",
        GROWING_READER = "growing_reader", "growing_reader",
        INDEPENDENT_READER = "independent_reader", "independent_reader",

    class Condition(models.TextChoices):
        NEW = "new", "new"
        FAIR = "fair", "fair"
        WORN = "worn", "worn"

    title = models.CharField(max_length=1024)
    call_number = models.CharField(max_length=64, null=True, blank=True)
    isbn = models.CharField(max_length=20, null=True, blank=True)
    author = models.CharField(max_length=1024, null=True, blank=True)
    recommended_level = models.CharField(choices=RecommendedLevel.choices, max_length=64, null=True, blank=True)
    page_count = models.PositiveIntegerField(null=True, blank=True)
    has_physical_copy = models.BooleanField(default=False)
    available_number = models.PositiveIntegerField(default=0)
    publisher = models.CharField(max_length=1024, null=True, blank=True)
    publication_year = models.PositiveIntegerField(null=True, blank=True)
    condition = models.CharField(choices=Condition.choices, max_length=64, null=True, blank=True)
    location = models.CharField(max_length=1024, null=True, blank=True)

    def __str__(self):
        return self.title


class BookGenre(BaseModel):
    book = models.ForeignKey("Book", on_delete=models.CASCADE, related_name="book_genres")
    genre = models.ForeignKey("Genre", on_delete=models.CASCADE, related_name="book_genres")
