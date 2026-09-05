from django.db import connection


def get_tenant_specific_upload_folder(filename, folder_name):
    upload_folder = f"{connection.schema_name}/{folder_name}/{filename}"
    return upload_folder
