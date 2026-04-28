import json
import boto3
import datetime
import urllib3
import base64
import urllib
import os 
# Test for CI/CD
s3 = boto3.client('s3')
rekognition = boto3.client('rekognition')
http = urllib3.PoolManager()

def lambda_handler(event, context):
    print("Received event: ", json.dumps(event))
    
    record = event['Records'][0]
    bucket = record['s3']['bucket']['name']
    key = record['s3']['object']['key']

    print(f"Processing photo from bucket: {bucket}, key: {key}")
    
    # Call Rekognition to detect labels
    rek_response = rekognition.detect_labels(
        Image={'S3Object': {'Bucket': bucket, 'Name': key}},
        MaxLabels=10,
        MinConfidence=75
    )
    
    labels = []
    for label in rek_response['Labels']:
        labels.append(label['Name'].lower())
        
    print(f"AI detected labels: {labels}")

    try:
        # Retrieve S3 metadata for custom labels
        s3_response = s3.head_object(Bucket=bucket, Key=key)
        # Note: AWS S3 metadata is case-insensitive, usually stored as 'customlabels'
        custom_labels_str = s3_response.get('Metadata', {}).get('customlabels', "")
        
        if custom_labels_str:
            custom_list = [l.strip().lower() for l in custom_labels_str.split(',')]
            labels.extend(custom_list)
            print(f"Added custom labels: {custom_list}")
            
    except Exception as e:
        print(f"Error handling custom labels: {str(e)}")

    # Remove duplicates
    final_labels = list(set(labels))
    
    index_data = {
        "objectKey": key,
        "bucket": bucket,
        "createdTimestamp": datetime.datetime.now().isoformat(),
        "labels": final_labels
    }
    
    print(f"JSON to be uploaded to OpenSearch: {json.dumps(index_data)}")

    # 2. Read from environment variables
    OS_USERNAME = os.environ.get('OS_USERNAME')
    OS_PASSWORD = os.environ.get('OS_PASSWORD')
    OS_HOST = os.environ.get('OS_HOST') # : search-xxx.us-east-1.es.amazonaws.com

    auth_str = f"{OS_USERNAME}:{OS_PASSWORD}"
    encoded_auth = base64.b64encode(auth_str.encode('utf-8')).decode('utf-8')

    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Basic {encoded_auth}' 
    }

    doc_id = urllib.parse.quote(key)
    url = f"https://{OS_HOST}/photos/_doc/{doc_id}"
    
    encoded_data = json.dumps(index_data).encode('utf-8')
    
    try:
        r = http.request(
            'POST',
            url,
            body=encoded_data,
            headers=headers
        )
        print(f"OpenSearch Response Status: {r.status}")
        print(f"OpenSearch Response Body: {r.data.decode('utf-8')}")
        
    except Exception as e:
        print(f"Error sending to OpenSearch: {str(e)}")

    return {
        'statusCode': 200,
        'body': json.dumps('Processing complete')
    }
