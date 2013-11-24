import csv
import time
import sys
import matplotlib.pyplot as plt

wait = 2

def run_simulation(data_a, data_b):
    global wait
    a = csv_read(data_a)
    b = csv_read(data_b)
    data = a + b

    time.sleep(wait)

    return data


def csv_read(f):
    reader = csv.reader(open(f, 'rU'), delimiter=':')
    data = []
    for row in reader:
        data.append(row)
    return data


def extract_column(data, column):
        col_data = []
        for row in data:
            col_data.append(float(row[column]))
        return col_data


def plot(data):
    #GetTemperature
    t = extract_column(data, 0)
    #GetPrecipitation
    p = extract_column(data, 1)
    
    plt.scatter(t, p, marker='o')
    plt.xlabel('Temperature')
    plt.ylabel('Precipitation')
    #plt.show()
    plt.savefig("output.png")

###############################################################################
#Main Program
data_a = sys.argv[1]
data_b = sys.argv[2]
#Simulation
data = run_simulation(data_a, data_b)
plot(data)

