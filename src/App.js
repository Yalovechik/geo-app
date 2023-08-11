import React, { useEffect, useState } from "react";
import maplibregl from "maplibre-gl";
import AmazonLocation from "amazon-location-helpers";
import AWS from "aws-sdk";

const App = () => {
  const [dynamoData, setDynamoData] = useState([]);
  const [mapCenter, setMapCenter] = useState(null);
  const [destinationPosition, setDestinationPosition] = useState(null);

  console.log(dynamoData, "dynamoData");

  useEffect(() => {
    AWS.config.update({
      accessKeyId: ""
      secretAccessKey: ""
      region: ""
    });
  }, []);

  useEffect(() => {
    async function fetchData() {
      const dynamoDB = new AWS.DynamoDB.DocumentClient();

      const params = {
        TableName: "RecognitionCdkStack-TableCD117FA1-HJJW47KRUK67",
      };

      try {
        const response = await dynamoDB.scan(params).promise();
        setDynamoData(response.Items);

        if (response.Items.length >= 1) {
          const addressToGeocode = response.Items[0].message;
          const location = new AWS.Location({
            credentials: await AmazonLocation.getCredentialsForIdentityPool(
              "eu-west-1:b019fdcf-5fc7-411e-9bf7-ad8d3feada7a"
            ),
            region: "eu-west-1",
          });

          const geocodeResponse = await location
            .searchPlaceIndexForText({
              IndexName: "Index",
              Text: addressToGeocode,
            })
            .promise();

          if (geocodeResponse.Results.length > 0) {
            const position = geocodeResponse.Results[0].Place.Geometry.Point;
            setMapCenter(position);

            if (response.Items.length >= 2) {
              const addressDestToGeocode = response.Items[1].message;
              const geocodeDestResponse = await location
                .searchPlaceIndexForText({
                  IndexName: "Index",
                  Text: addressDestToGeocode,
                })
                .promise();

              if (geocodeDestResponse.Results.length > 0) {
                const destPosition =
                  geocodeDestResponse.Results[0].Place.Geometry.Point;
                setDestinationPosition(destPosition);
              } else {
                // Use the default position if the destination position doesn't exist
                setDestinationPosition(position);
              }
            } else {
              // Use the default position if there's only one item
              setDestinationPosition(position);
            }
          }
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    }

    fetchData();
  }, []);

  useEffect(() => {
    async function initializeMap() {
      if (mapCenter && destinationPosition) {
        const map = await AmazonLocation.createMap(
          {
            identityPoolId: "eu-west-1:b019fdcf-5fc7-411e-9bf7-ad8d3feada7a",
          },
          {
            container: "map",
            center: mapCenter,
            zoom: 10,
            style: "Map",
            hash: true,
          }
        );

        map.addControl(new maplibregl.NavigationControl(), "top-left");

        map.on("load", async () => {
          const location = new AWS.Location({
            credentials: await AmazonLocation.getCredentialsForIdentityPool(
              "eu-west-1:b019fdcf-5fc7-411e-9bf7-ad8d3feada7a"
            ),
            region: "eu-west-1",
          });

          const data = await location
            .searchPlaceIndexForText({
              IndexName: "Index",
              Text: "19 Quai de Paludate, 33800 Bordeaux",
            })
            .promise();

          const position = data.Results[0].Place.Geometry.Point;

          map.flyTo({ center: position, zoom: 15 });

          const destinationCoordinates = [
            destinationPosition[0],
            destinationPosition[1],
          ];
          const departureCoordinates = [mapCenter[0], mapCenter[1]];

          const routeResponse = await location
            .calculateRoute({
              CalculatorName: "Standard",
              DeparturePosition: departureCoordinates,
              DestinationPosition: destinationCoordinates,
              TravelMode: "Walking",
            })
            .promise();

          const routeStepsCoordinates = routeResponse.Legs[0].Steps.map(
            (step) => step.StartPosition
          );

          routeStepsCoordinates.unshift(departureCoordinates);
          routeStepsCoordinates.push(destinationCoordinates);

          const routeFeature = {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: routeStepsCoordinates,
            },
          };

          map.addSource("route-source", {
            type: "geojson",
            data: routeFeature,
          });

          map.addLayer({
            id: "route",
            type: "line",
            source: "route-source",
            layout: {
              "line-join": "round",
              "line-cap": "round",
            },
            paint: {
              "line-color": "#000000",
              "line-width": 5,
            },
          });
        });
      }
    }

    initializeMap();
  }, [mapCenter, destinationPosition]);

  return <div id="map" style={{ height: "700px", width: "1050px" }} />;
};

export default App;
