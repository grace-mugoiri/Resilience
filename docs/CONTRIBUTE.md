# Contributing to Resilience [Devs Version]
Thank you for your interest in contributing! We welcome bug fixes, feature proposals, and documentation updates. Follow these guidelines to ensure smooth collaboration process.

---

## 📜  Code Of Conduct
By participating in this project, you agree to abide by our code of conduct. Please read it before contributing.

## 🐛 How to Report a Bug
1. Check the **Issues** tab to see if the bug has already been reported.
2. If not, open a new issue.
3. Include clear steps to reproduce the error, your environment details, and the expected vs. actual behavior.

## 💡 How to Propose a Feature
1. Open a new issue and select the **Feature Request** template.
2. Clearly explain the problem this feature solves and your proposed solution.
3. Wait for feedback from maintainers before you begin writing code.

## 🛠️ Local Development Setup

### 1. Fork the repository
* On your browser search [https://github.com/grace-mugoiri/Resilience](https://github.com/grace-mugoiri/Resilience)
* Click on fork, and proceed creating a fork of the repository set up in your github account


### 2. Clone
Fork the repository on GitHub and clone your fork locally:
\`\`\`bash
git clone https://github.com/grace-mugoiri/Resilience
cd Resilience
\`\`\`

### 3. Set Up Upstream
Keep your local copy synced with the original project:
\`\`\`bash
git remote add upstream https://github.com/grace-mugoiri/Resilience.git
\`\`\`

### 4. Fetch the latest changes
Download all branches and history from the original repository without altering your local changes
 \`\`\`bash
git fetch upstream
\`\`\`

### 5. Switch to your default branch
Ensure you are on your `main` or `frontend` branch
 \`\`\`bash
git checkout frontend
\`\`\`

### 6. Merge the changes
Bring the upstream changes into your local branch. This syncs your local files
 \`\`\`bash
git merge upstream/main
\`\`\`

### 7. Install Dependencies
Install the required packages for development:
\`\`\`bash
npm install
\`\`\`


## 🚀 Contribution Workflow

### 1. Create a Branch
Always create a new, descriptively named branch for your work:
\`\`\`bash
git checkout -b feature/issue-number/your-feature-name
# or for bugs:
git checkout -b fix/issue-number/bug-name
\`\`\`

### 2. Code and Test
* Follow the existing project code style.
* Run the linters to verify syntax: \`npm run lint\`
* Ensure all existing and new tests pass: \`npm test\`

### 3. Commit Guidelines
We use [Conventional Commits](https://conventionalcommits.org). Please format your messages like this:
* \`feat: add user authentication\`
* \`fix: resolve broken login button\`
* \`docs: update API documentation\`

### 4. Submit a Pull Request
1. Push your branch to your GitHub fork:
   \`\`\`bash
   git push origin branch-name
   \`\`\`
2. Navigate to the original repository on GitHub and click **Compare & pull request**.
3. Fill out the PR template completely. 
4. Link the PR to your open issue by adding "Closes #IssueNumber" in the description.
5. Add any of the maintainers as reviewers


## 📬 Review Process
* Maintainers will review your PR within [e.g., 2-3 days].
* Be prepared to answer questions or make requested changes.
* Once approved, your code will be merged into the project!