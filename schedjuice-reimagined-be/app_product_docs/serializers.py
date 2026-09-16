from rest_framework import serializers

from app_product_docs.models import DocArticle, DocCategory, DocVideo


class DocCategorySerializer(serializers.ModelSerializer):
    article_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = DocCategory
        fields = [
            "id",
            "slug",
            "title",
            "sort_order",
            "default_audience",
            "article_count",
            "created_at",
            "updated_at",
        ]


class DocArticleReaderSerializer(serializers.ModelSerializer):
    category_slug = serializers.CharField(source="category.slug", read_only=True)
    category_title = serializers.CharField(source="category.title", read_only=True)

    class Meta:
        model = DocArticle
        fields = [
            "id",
            "slug",
            "title",
            "markdown_body",
            "category_slug",
            "category_title",
            "audiences",
            "published_at",
            "updated_at",
        ]


class DocArticleAdminSerializer(serializers.ModelSerializer):
    category_slug = serializers.CharField(source="category.slug", read_only=True)
    category_title = serializers.CharField(source="category.title", read_only=True)

    class Meta:
        model = DocArticle
        fields = [
            "id",
            "slug",
            "title",
            "markdown_body",
            "category",
            "category_slug",
            "category_title",
            "audiences",
            "status",
            "published_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["status", "published_at"]


class DocArticleWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocArticle
        fields = ["slug", "title", "markdown_body", "category", "audiences"]

    def validate_audiences(self, value):
        if not value:
            raise serializers.ValidationError("Select at least one audience.")
        return value


class DocVideoSerializer(serializers.ModelSerializer):
    markdown_snippet = serializers.SerializerMethodField()

    class Meta:
        model = DocVideo
        fields = [
            "id",
            "title",
            "video_url",
            "duration_sec",
            "status",
            "error_message",
            "article",
            "markdown_snippet",
            "created_at",
        ]

    def get_markdown_snippet(self, obj):
        if not obj.video_url:
            return ""
        title = obj.title or "Video"
        return f"@[{title}](video:{obj.video_url})"
