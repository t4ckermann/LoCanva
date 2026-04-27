import os
from unittest.mock import patch

from google_drive import drive_folder_path_segments


class TestFolderPath:
    def test_default_empty(self):
        with patch.dict(os.environ, {"GOOGLE_DRIVE_FOLDER_PATH": ""}, clear=False):
            assert drive_folder_path_segments() == []

    def test_bal_new(self):
        with patch.dict(
            os.environ, {"GOOGLE_DRIVE_FOLDER_PATH": "/bal/new"}, clear=False,
        ):
            assert drive_folder_path_segments() == ["bal", "new"]
