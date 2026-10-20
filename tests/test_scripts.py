"""Tests that keep the installers, README, and release workflow in sync."""

from pathlib import Path

ROOT = Path(__file__).parents[1]
SCRIPTS = ROOT / "scripts"
README = ROOT / "README.md"
RELEASE_WORKFLOW = ROOT / ".github" / "workflows" / "release.yml"
TESTING_BRANCH = "main"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_powershell_installer_completes_the_whole_setup() -> None:
    script = read(SCRIPTS / "install.ps1")

    assert "uv tool install" in script
    assert "Download the Tabman browser extension too?" in script
    assert "Next steps" in script
    assert "tabman --help" in script
    assert "git+https://github.com" in script
    assert TESTING_BRANCH in script


def test_shell_installer_completes_the_whole_setup() -> None:
    script = read(SCRIPTS / "install.sh")

    assert "uv tool install" in script
    assert "Download the Tabman browser extension too?" in script
    assert "Next steps" in script
    assert "tabman --help" in script
    assert "git+https://github.com" in script
    assert TESTING_BRANCH in script


def test_extension_installers_exist_for_every_platform() -> None:
    assert (SCRIPTS / "install-extension.ps1").is_file()
    assert (SCRIPTS / "install-extension.sh").is_file()


def test_readme_one_liners_point_at_the_default_branch() -> None:
    readme = read(README)

    assert (
        f"raw.githubusercontent.com/Anshulgada/brave-tab-manager/{TESTING_BRANCH}"
        in readme
    )
    assert "feat/rebuild" not in readme


def test_readme_documents_the_uv_install_paths() -> None:
    readme = read(README)

    assert "uv tool install tabman" in readme
    assert "uvx tabman" in readme


def test_readme_documents_compatible_providers() -> None:
    readme = read(README)

    assert "config add-provider" in readme
    assert "config list-providers" in readme
    assert "openai" in readme
    assert "anthropic" in readme


def test_release_workflow_is_the_only_publisher() -> None:
    workflow = read(RELEASE_WORKFLOW)

    assert "pypa/gh-action-pypi-publish" in workflow
    assert "tabmanextension-latest-chrome.zip" in workflow
    assert "scripts/install-extension.sh" in workflow
    assert not (ROOT / ".github" / "workflows" / "pypi-publish.yml").exists()


def test_workflows_pin_current_action_versions() -> None:
    deprecated = (
        "actions/checkout@v4",
        "actions/setup-node@v4",
        "actions/upload-artifact@v4",
        "actions/download-artifact@v4",
    )
    for workflow in sorted((ROOT / ".github" / "workflows").glob("*.yml")):
        text = read(workflow)
        for action in deprecated:
            assert action not in text, f"{workflow.name} still pins {action}"


def test_workflows_use_the_visible_extension_output_directory() -> None:
    for workflow in sorted((ROOT / ".github" / "workflows").glob("*.yml")):
        text = read(workflow)
        assert "extension/.output" not in text
