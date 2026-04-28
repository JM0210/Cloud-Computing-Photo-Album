import json
import boto3
import urllib3
import base64
import os  # 1. Import os to read environment variables

http = urllib3.PoolManager()
lex_client = boto3.client('lexv2-runtime')
# Test for CI/CD
def lambda_handler(event, context):
    print("Received Lex event:", json.dumps(event))
    
    # 2. Extract query parameter from API Gateway
    q_param = event.get('queryStringParameters', {}).get('q', '')
    if not q_param:
        q_param = event.get('q', '') # Fallback for different API Gateway integration types

    if not q_param:
        return {'statusCode': 400, 'body': json.dumps('Empty query')}

    try:
        # 3. Read Lex configuration from environment variables
        bot_id = os.environ.get('BOT_ID')
        bot_alias_id = os.environ.get('BOT_ALIAS_ID')
        
        lex_response = lex_client.recognize_text(
            botId=bot_id,           
            botAliasId=bot_alias_id,   
            localeId='en_US',
            sessionId='testuser-123',
            text=q_param
        )
        print("Lex Response:", json.dumps(lex_response))

        # Extract slots from Lex response
        slots = lex_response.get('sessionState', {}).get('intent', {}).get('slots', {})
        keywords = []
        for slot_name in ['item', 'item1', 'item2']:
            slot = slots.get(slot_name)
            if slot and slot.get('value'):
                keywords.append(slot['value']['interpretedValue'].lower())

        print(f"Keywords extracted by Lex: {keywords}")

        if not keywords:
            return build_response([], f"Lex could not identify keywords from: {q_param}")

        # 4. Read OpenSearch info from environment variables
        os_host = os.environ.get('OS_HOST')
        os_user = os.environ.get('OS_USERNAME')
        os_pass = os.environ.get('OS_PASSWORD')

        url = f"https://{os_host}/photos/_search"

        search_query = {
            "query": {
                "terms": {
                    "labels": keywords  
                }
            }
        }
        
        auth_str = f"{os_user}:{os_pass}"
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Basic {base64.b64encode(auth_str.encode()).decode()}'
        }
        
        response = http.request('GET', url, body=json.dumps(search_query), headers=headers)
        res_json = json.loads(response.data.decode('utf-8'))

        print("OpenSearch raw response:", json.dumps(res_json))
        hits = res_json.get('hits', {}).get('hits', [])
        image_list = []
        
        for hit in hits:
            source = hit['_source']
            bucket = source['bucket']
            key = source['objectKey']
            
            # Formulating the S3 URL
            img_url = f"https://{bucket}.s3.amazonaws.com/{key}"
            image_list.append(img_url)

        return build_response(image_list, f"Found {len(image_list)} images.")

    except Exception as e:
        print(f"Error occurred: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': str(e)})
        }
        
def build_response(image_list, message):
    return {
        'statusCode': 200,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        },
        'body': json.dumps({
            'results': image_list,
            'message': message
        })
    }
