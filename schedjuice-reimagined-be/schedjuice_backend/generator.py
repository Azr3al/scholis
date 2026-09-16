from datetime import datetime


def generate_view(output_file: str, model_name: str):
    """
    A piece of script to help me generate some boring boilerplate codes.
    Run with this command: python3 -c "from schedjuice_backend.generator import *; generate_view('output.txt', 'Entity')"
    """
    content = f"Generated at {datetime.now()}.\n\n"
    content += f"""
class {model_name}ListView(BaseListView):
    name = "{model_name} list view"
    model = models.{model_name}
    serializer = serializers.{model_name}Serializer


class {model_name}DetailsView(BaseDetailsView):
    name = "{model_name} details view"
    model = models.{model_name}
    serializer = serializers.{model_name}Serializer


class {model_name}SearchView(BaseSearchView):
    name = "{model_name} search view"
    model = models.{model_name}
    serializer = serializers.{model_name}Serializer
    """
    f = open(output_file, "w")
    f.write(content)
    print("finished.")


def generate_urls(output_file: str, model_name: str, base_path_name: str):
    """
    Similar with the generate_view() function. This, instead, will generate urlpatterns.
    Run with this command: python3 -c "from schedjuice_backend.generator import *; generate_urls('output.txt', 'Entity', 'entities')"

    """

    content = f"""path("{base_path_name}", views.{model_name}ListView.as_view(), name="{model_name.lower()}-list"),\n"""
    content += f"""path("{base_path_name}/<int:obj_id>", views.{model_name}DetailsView.as_view(), name="{model_name.lower()}-details"),\n"""
    content += f"""path("{base_path_name}/search", views.{model_name}SearchView.as_view(), name="{model_name.lower()}-search"),\n"""
    f = open(output_file, "w")
    f.write(content)
    print("finished")
