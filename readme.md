# AA Meetings Map

## Installation & Usage

_You'll need to have a running Postgresql database with the data from my weekly assignments. See [rijkvanzanten/data-structures](https://github.com/rijkvanzanten/data-structures/tree/master/assignment-7)_.

1. Clone this repo
1. Install the node modules by running `npm install`
1. Create a `.env` file in the root of this folder (see example-env.txt)
1. Run the server by running `npm start`

## Notes

I tried using serverless functions. However, serverless functions are supposed to be stateless, making database connection pooling basically impossible. (There are workarounds, but those defeat the purpose).

I haven't really figured out what the perfect usecase for serverless functions would be. I'm guessing it would be a good "middleman" solution to other third party services maybe?
