# Cloud Computing - Photo Album Web Application (Assignment 3)

This project is a Serverless Photo Album application deployed on AWS. It allows users to upload photos, automatically labels them using **AWS Rekognition**, and provides a search interface based on natural language queries via **Amazon OpenSearch**.

##  Project Structure
According to the assignment requirements, the repository is organized as follows:

```text
.
├── front-end/           # Web interface (HTML, CSS, JS)
├── lambda-functions/    # Python code for Backend (Index & Search)
│── template.yaml    # SAM/CloudFormation Template  # Infrastructure as Code and CI/CD configurations
│── buildspec.yml    # CodeBuild Specification
└── README.md
